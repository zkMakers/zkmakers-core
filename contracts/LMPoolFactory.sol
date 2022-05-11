// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./LMPool.sol";

contract LMPoolFactory is ReentrancyGuard, Ownable, AccessControl {
    bytes32 public constant OWNER_ADMIN = keccak256("OWNER_ADMIN");
    bytes32 public constant ORACLE_NODE = keccak256("ORACLE_NODE");

    address[] public allPools;

    event PoolCreated(
        address indexed pool,
        uint256 created
    );

    function createOracle(address oracle) external {
        require(hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        _grantRole(ORACLE_NODE, oracle);
    }

    function removeOracle(address oracle) external {
        require(hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        _revokeRole(ORACLE_NODE, oracle);
    }

    function createDynamicPool(
        address _rewardToken,
        uint256 _startDate,
        uint256 _endDate,
        uint256 _rewardPerBlock
    ) external returns(address) {
        LMPool newPool = new LMPool(
            address(this),
            _rewardToken,
            _startDate,
            _endDate,
            _rewardPerBlock
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
