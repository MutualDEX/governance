pragma solidity ^0.5.16;

import "./SafeMath.sol";

contract BigTreasuryVester {
    using SafeMath for uint;

    address public bgsp;
    address public recipient;

    uint public vestingAmount;
    uint public vestingBegin;
    uint public vestingCliff;
    uint public vestingEnd;

    uint public lastUpdate;

    constructor(
        address bgsp_,
        address recipient_,
        uint vestingAmount_,
        uint vestingBegin_,
        uint vestingCliff_,
        uint vestingEnd_
    ) public {
        require(vestingBegin_ >= block.timestamp, 'BigTreasuryVester::constructor: vesting begin too early');
        require(vestingCliff_ >= vestingBegin_, 'BigTreasuryVester::constructor: cliff is too early');
        require(vestingEnd_ > vestingCliff_, 'BigTreasuryVester::constructor: end is too early');

        bgsp = bgsp_;
        recipient = recipient_;

        vestingAmount = vestingAmount_;
        vestingBegin = vestingBegin_;
        vestingCliff = vestingCliff_;
        vestingEnd = vestingEnd_;

        lastUpdate = vestingBegin;
    }

    function setRecipient(address recipient_) public {
        require(msg.sender == recipient, 'BigTreasuryVester::setRecipient: unauthorized');
        recipient = recipient_;
    }

    function claim() public {
        require(block.timestamp >= vestingCliff, 'BigTreasuryVester::claim: not time yet');
        uint amount;
        if (block.timestamp >= vestingEnd) {
            amount = IBgsp(bgsp).balanceOf(address(this));
        } else {
            amount = vestingAmount.mul(block.timestamp - lastUpdate).div(vestingEnd - vestingBegin);
            lastUpdate = block.timestamp;
        }
        IBgsp(bgsp).transfer(recipient, amount);
    }
}

interface IBgsp {
    function balanceOf(address account) external view returns (uint);
    function transfer(address dst, uint rawAmount) external returns (bool);
}

