// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./LMPool.sol";
import "./ILMPoolFactory.sol";

contract LMPoolFactory is ILMPoolFactory, ReentrancyGuard, Ownable, AccessControl {
    bytes32 public constant OWNER_ADMIN = keccak256("OWNER_ADMIN");
    bytes32 public constant ORACLE_NODE = keccak256("ORACLE_NODE");

    address[] public allPools;

    uint256 fee = 1000; // 10%

    // ERC20 => Accepted
    mapping(address => bool) public acceptedRewardTokens;

    mapping(string => bool) public acceptedExchanges;
    mapping(address => bool) public pools;

    event PoolCreated(
        address indexed pool,
        string indexed exchange,
        string indexed pair,
        uint256 created
    );

    event RewardsAdded(
        address indexed pool,
        uint256 endRewardsDate
    );

    constructor() {
        _grantRole(OWNER_ADMIN, msg.sender);
    }

    function getFee() external override view returns (uint256) {
        return fee;
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

    function setFee(uint256 amount) external {
        require(hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        fee = amount;
    }

    function addExchange(string calldata name) external {
        require(hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        acceptedExchanges[name] = true;
    }

    function removeExchange(string calldata name) external {
        require(hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        acceptedExchanges[name] = false;
    }

    function addRewards(address pool, uint256 amount, uint256 rewardDurationInEpochs) external {
        require(pools[pool], "Pool not found");
        uint256 feeAmount = (amount * fee) / 10000;
        uint256 rewards = amount - feeAmount;
        LMPool poolImpl = LMPool(pool);
        IERC20(poolImpl.getRewardToken()).transferFrom(msg.sender, address(this), feeAmount);
        IERC20(poolImpl.getRewardToken()).transferFrom(msg.sender, address(pool), rewards);
        poolImpl.addRewards(rewards, rewardDurationInEpochs);
        emit RewardsAdded(pool, poolImpl.getStartDate() + poolImpl.getEpochDuration() * poolImpl.getLastEpoch());
    }

    function createDynamicPool(
        string calldata _exchange,
        string calldata _pair,
        address _rewardToken
    ) external returns(address) {
        require(acceptedRewardTokens[_rewardToken], "LMPoolFactory: Reward token is not accepted.");
        require(acceptedExchanges[_exchange], "LMPoolFactory: Exchange is not accepted.");

        LMPool newPool = new LMPool(
            address(this),
            _exchange,
            _pair,
            _rewardToken
        );

        allPools.push(address(newPool));
        pools[address(newPool)] = true;

        emit PoolCreated(
            address(newPool),
            _exchange,
            _pair,
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
