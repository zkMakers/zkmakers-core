// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./LMPool.sol";

contract LMPoolFactory is ReentrancyGuard, Ownable, AccessControl {
    bytes32 public constant OWNER_ADMIN = keccak256("OWNER_ADMIN");
    bytes32 public constant FACTORY_ADMIN = keccak256("FACTORY_ADMIN");

    address[] public allPools;

    event PoolCreated(
        address indexed pool,
        uint256 created
    );

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function create(
        address _rewardToken,
        uint256 _startDate
    ) external returns(address) {
        LMPool newPool = new LMPool(
            _rewardToken,
            _startDate
        );

        allPools.push(address(newPool));

        emit PoolCreated(
            address(newPool),
            block.timestamp
        );

        LMPool(newPool).grantRole(OWNER_ADMIN, msg.sender);
        LMPool(newPool).grantRole(FACTORY_ADMIN, address(this));

        return address(newPool);
    }

    function grantPoolRole(address payable poolAddress, bytes32 role, address account) external {
        require(LMPool(poolAddress).hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        LMPool(poolAddress).grantRole(role, account);
    }
    
}
