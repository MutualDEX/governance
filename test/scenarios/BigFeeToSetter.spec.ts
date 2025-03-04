import chai, { expect } from 'chai'
import { Contract, constants } from 'ethers'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'

import BigswapV2Factory from '@bigswap/v2-core/build/BigswapV2Factory.json'
import BigFeeToSetter from '../../build/BigFeeToSetter.json'

import { governanceFixture } from '../fixtures'
import { mineBlock } from '../utils'

chai.use(solidity)

describe('scenario:BigFeeToSetter', () => {
  const provider = new MockProvider({
    ganacheOptions: {
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999,
    },
  })
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  beforeEach(async () => {
    await loadFixture(governanceFixture)
  })

  let factory: Contract
  beforeEach('deploy bigswap v2', async () => {
    factory = await deployContract(wallet, BigswapV2Factory, [wallet.address])
  })

  let feeToSetter: Contract
  let vestingEnd: number
  beforeEach('deploy feeToSetter vesting contract', async () => {
    const { timestamp: now } = await provider.getBlock('latest')
    vestingEnd = now + 60
    // 3rd constructor arg should be timelock, just mocking for testing purposes
    // 4th constructor arg should be feeTo, just mocking for testing purposes
    feeToSetter = await deployContract(wallet, BigFeeToSetter, [
      factory.address,
      vestingEnd,
      wallet.address,
      other.address,
    ])

    // set feeToSetter to be the vesting contract
    await factory.setFeeToSetter(feeToSetter.address)
  })

  it('setOwner:fail', async () => {
    await expect(feeToSetter.connect(other).setOwner(other.address)).to.be.revertedWith(
      'BigFeeToSetter::setOwner: not allowed'
    )
  })

  it('setOwner', async () => {
    await feeToSetter.setOwner(other.address)
  })

  it('setFeeToSetter:fail', async () => {
    await expect(feeToSetter.setFeeToSetter(other.address)).to.be.revertedWith(
      'BigFeeToSetter::setFeeToSetter: not time yet'
    )
    await mineBlock(provider, vestingEnd)
    await expect(feeToSetter.connect(other).setFeeToSetter(other.address)).to.be.revertedWith(
      'BigFeeToSetter::setFeeToSetter: not allowed'
    )
  })

  it('setFeeToSetter', async () => {
    await mineBlock(provider, vestingEnd)
    await feeToSetter.setFeeToSetter(other.address)
  })

  it('toggleFees:fail', async () => {
    await expect(feeToSetter.toggleFees(true)).to.be.revertedWith('BigFeeToSetter::toggleFees: not time yet')
    await mineBlock(provider, vestingEnd)
    await expect(feeToSetter.connect(other).toggleFees(true)).to.be.revertedWith('BigFeeToSetter::toggleFees: not allowed')
  })

  it('toggleFees', async () => {
    let feeTo = await factory.feeTo()
    expect(feeTo).to.be.eq(constants.AddressZero)

    await mineBlock(provider, vestingEnd)

    await feeToSetter.toggleFees(true)
    feeTo = await factory.feeTo()
    expect(feeTo).to.be.eq(other.address)

    await feeToSetter.toggleFees(false)
    feeTo = await factory.feeTo()
    expect(feeTo).to.be.eq(constants.AddressZero)
  })
})
