import chai, { expect } from 'chai'
import { BigNumber, Contract, constants, utils } from 'ethers'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'
import { ecsign } from 'ethereumjs-util'

import { governanceFixture } from './fixtures'
import { expandTo18Decimals, mineBlock } from './utils'

import Bgsp from '../build/Bgsp.json'

chai.use(solidity)

const DOMAIN_TYPEHASH = utils.keccak256(
  utils.toUtf8Bytes('EIP712Domain(string name,uint256 chainId,address verifyingContract)')
)

const PERMIT_TYPEHASH = utils.keccak256(
  utils.toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
)

describe('Bgsp', () => {
  const provider = new MockProvider({
    ganacheOptions: {
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999,
    },
  })
  const [wallet, other0, other1] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let bgsp: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(governanceFixture)
    bgsp = fixture.bgsp
  })

  it('permit', async () => {
    const domainSeparator = utils.keccak256(
      utils.defaultAbiCoder.encode(
        ['bytes32', 'bytes32', 'uint256', 'address'],
        [DOMAIN_TYPEHASH, utils.keccak256(utils.toUtf8Bytes('Big Swap')), 1, bgsp.address]
      )
    )

    const owner = wallet.address
    const spender = other0.address
    const value = 123
    const nonce = await bgsp.nonces(wallet.address)
    const deadline = constants.MaxUint256
    const digest = utils.keccak256(
      utils.solidityPack(
        ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
        [
          '0x19',
          '0x01',
          domainSeparator,
          utils.keccak256(
            utils.defaultAbiCoder.encode(
              ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
              [PERMIT_TYPEHASH, owner, spender, value, nonce, deadline]
            )
          ),
        ]
      )
    )

    const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

    await bgsp.permit(owner, spender, value, deadline, v, utils.hexlify(r), utils.hexlify(s))
    expect(await bgsp.allowance(owner, spender)).to.eq(value)
    expect(await bgsp.nonces(owner)).to.eq(1)

    await bgsp.connect(other0).transferFrom(owner, spender, value)
  })

  it('nested delegation', async () => {
    await bgsp.transfer(other0.address, expandTo18Decimals(1))
    await bgsp.transfer(other1.address, expandTo18Decimals(2))

    let currectVotes0 = await bgsp.getCurrentVotes(other0.address)
    let currectVotes1 = await bgsp.getCurrentVotes(other1.address)
    expect(currectVotes0).to.be.eq(0)
    expect(currectVotes1).to.be.eq(0)

    await bgsp.connect(other0).delegate(other1.address)
    currectVotes1 = await bgsp.getCurrentVotes(other1.address)
    expect(currectVotes1).to.be.eq(expandTo18Decimals(1))

    await bgsp.connect(other1).delegate(other1.address)
    currectVotes1 = await bgsp.getCurrentVotes(other1.address)
    expect(currectVotes1).to.be.eq(expandTo18Decimals(1).add(expandTo18Decimals(2)))

    await bgsp.connect(other1).delegate(wallet.address)
    currectVotes1 = await bgsp.getCurrentVotes(other1.address)
    expect(currectVotes1).to.be.eq(expandTo18Decimals(1))
  })

  it('mints', async () => {
    const { timestamp: now } = await provider.getBlock('latest')
    const bgsp = await deployContract(wallet, Bgsp, [wallet.address, wallet.address, now + 60 * 60])
    const supply = await bgsp.totalSupply()

    await expect(bgsp.mint(wallet.address, 1)).to.be.revertedWith('Bgsp::mint: minting not allowed yet')

    let timestamp = await bgsp.mintingAllowedAfter()
    await mineBlock(provider, timestamp.toString())

    await expect(bgsp.connect(other1).mint(other1.address, 1)).to.be.revertedWith('Bgsp::mint: only the minter can mint')
    await expect(bgsp.mint('0x0000000000000000000000000000000000000000', 1)).to.be.revertedWith('Bgsp::mint: cannot transfer to the zero address')

    // can mint up to 2%
    const mintCap = BigNumber.from(await bgsp.mintCap())
    const amount = supply.mul(mintCap).div(100)
    await bgsp.mint(wallet.address, amount)
    expect(await bgsp.balanceOf(wallet.address)).to.be.eq(supply.add(amount))

    timestamp = await bgsp.mintingAllowedAfter()
    await mineBlock(provider, timestamp.toString())
    // cannot mint 2.01%
    await expect(bgsp.mint(wallet.address, supply.mul(mintCap.add(1)))).to.be.revertedWith('Bgsp::mint: exceeded mint cap')
  })
})

