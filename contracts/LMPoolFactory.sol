// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./LMPool.sol";

contract LMPoolFactory is ReentrancyGuard, Ownable, AccessControl {
    bytes32 public constant OWNER_ADMIN = keccak256("OWNER_ADMIN");
    bytes32 public constant ORACLE_NODE = keccak256("ORACLE_NODE");

    address[] public allPools;

    // ERC20 => Accepted
    mapping(address => bool) public acceptedRewardTokens;

    event PoolCreated(
        address indexed pool,
        uint256 created
    );

    constructor() {
        _grantRole(OWNER_ADMIN, msg.sender);
    }

    function addOwner(address owner) external {
        require(hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        _grantRole(OWNER_ADMIN, owner);
    }

    function removeOwner(address owner) external {
        require(hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        _revokeRole(OWNER_ADMIN, owner);
    }

    function createOracle(address oracle) external {
        require(hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        _grantRole(ORACLE_NODE, oracle);
    }

    function removeOracle(address oracle) external {
        require(hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        _revokeRole(ORACLE_NODE, oracle);
    }

    function acceptRewardToken(address token) external {
        require(hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        acceptedRewardTokens[token] = true;
    }

    function rejectRewardToken(address token) external {
        require(hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        acceptedRewardTokens[token] = false;
    }

    function withdraw(address token, address receiver, uint256 amount) external {
        require(hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        IERC20(token).transfer(receiver, amount);
    }

    function createDynamicPool(
        address _rewardToken,
        uint256 _startDate,
        uint256 _endDate,
        uint256 _rewardPerEpoch
    ) external returns(address) {
        require(acceptedRewardTokens[_rewardToken], "LMPoolFactory: Reward token is not accepted.");

        LMPool newPool = new LMPool(
            address(this),
            _rewardToken,
            _startDate,
            _endDate,
            _rewardPerEpoch
        );

        allPools.push(address(newPool));

        emit PoolCreated(
            address(newPool),
            block.timestamp
        );

        LMPool(newPool).grantRole(OWNER_ADMIN, msg.sender);
        return address(newPool);
    }

    function grantPoolRole(address payable poolAddress, bytes32 role, address account) external {
        require(LMPool(poolAddress).hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        LMPool(poolAddress).grantRole(role, account);
    }
    
}
