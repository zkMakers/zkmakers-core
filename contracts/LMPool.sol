// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract LMPool is ReentrancyGuard, Ownable, AccessControl {
    bytes32 public constant OWNER_ADMIN = keccak256("OWNER_ADMIN");
    bytes32 public constant FACTORY_ADMIN = keccak256("FACTORY_ADMIN");

    using Address for address payable;

    address public rewardToken;
    uint256 public tokenDecimals;
    uint256 public startDate;
    uint256 public endDate;
    bool public funded = false;

    constructor(
        address _rewardToken,
        uint256 _startDate
    ) {
        tokenDecimals = IERC20Metadata(_rewardToken).decimals();
        startDate = _startDate;
        rewardToken = _rewardToken;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function fund(uint256 totalTokens)
        external
    {
        require(!funded, "LMPool: Already funded");

        IERC20(rewardToken).transferFrom(msg.sender, address(this), totalTokens); // ToDo get tokens from constructor
        funded = true;
    }


    function isActive()
        public
        view
        returns(bool)
    {
        return (
            funded && block.timestamp >= startDate
            // && block.timestamp < endDate
        );
    }

    modifier isPoolRunning() {
        require(isActive(), 'LMPool: Pool has not started');
        _;
    }
}
