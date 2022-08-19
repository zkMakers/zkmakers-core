// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./LMPool.sol";
import "./ILMPoolFactory.sol";
import "./TransferHelper.sol";

contract LMPoolFactory is ILMPoolFactory, ReentrancyGuard, Ownable, AccessControl {
    bytes32 public constant OWNER_ADMIN = keccak256("OWNER_ADMIN");
    bytes32 public constant ORACLE_NODE = keccak256("ORACLE_NODE");

    //ID OF THE CHAIN WHERE THE FACTORY IS DEPLOYED
    uint256 private CONTRACT_DEPLOYED_CHAIN;

    address[] public allPools;
    
    //Fee for reward token
    uint256 fee = 1000; // 10%
    
    //Fee for reward with custom token
    uint256 customTokenFee = 2000; // 2%

    // ERC20 => Accepted
    mapping(address => bool) public acceptedRewardTokens;

    // CHAIN ID => Accepted
    mapping(uint32 => bool) public acceptedBlockchains;

    mapping(string => bool) public acceptedExchanges;
    mapping(address => bool) public pools;

    event PoolCreated(
        address indexed pool,
        string indexed exchange,
        address indexed pairTokenA,
        address pairTokenB,
        uint32 chainId,
        uint256 created
    );

    event RewardsAddedd(
        address indexed pool,
        uint256 endRewardsDate
    );

    constructor() {
        _grantRole(OWNER_ADMIN, msg.sender);
        CONTRACT_DEPLOYED_CHAIN = getChainID();
    }

    function getChainID() internal view returns (uint256) {
        uint256 id;
        assembly {
            id := chainid()
        }
        return id;
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

    function setCustomTokenFee(uint256 amount) external {
        require(hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        customTokenFee = amount;
    }

    function addBlockchain(uint32 chainId) external {
        require(hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        acceptedBlockchains[chainId] = true;
    }

    function removeBlockchain(uint32 chainId) external {
        require(hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        acceptedBlockchains[chainId] = false;
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
        TransferHelper.safeTransferFrom(poolImpl.getRewardToken(), msg.sender, address(this), feeAmount);
        TransferHelper.safeTransferFrom(poolImpl.getRewardToken(), msg.sender, address(pool), rewards);        
        poolImpl.addRewards(rewards, rewardDurationInEpochs);
        emit RewardsAddedd(pool, poolImpl.getStartDate() + poolImpl.getEpochDuration() * poolImpl.getLastEpoch());
    }

    function createDynamicPool(
        string calldata _exchange,        
        address _pairTokenA,
        address _pairTokenB,
        address _rewardToken,
        uint32 _chainId
    ) external returns(address) {
        require(acceptedRewardTokens[_rewardToken] || 
                _rewardToken == _pairTokenA || 
                _rewardToken == _pairTokenB, "LMPoolFactory: Reward token is not accepted.");
        require(acceptedExchanges[_exchange], "LMPoolFactory: Exchange is not accepted.");
        require(acceptedBlockchains[_chainId], "LMPoolFactory: Blockchain is not accepted.");

        //If reward token is one of the pair, the fee is the customTokenFee
        if (!acceptedRewardTokens[_rewardToken]){
            fee = customTokenFee;
        }
        
        LMPool newPool = new LMPool(
            address(this),
            _exchange,
            _pairTokenA,
            _pairTokenB,
            _rewardToken,
            _chainId
        );

        allPools.push(address(newPool));
        pools[address(newPool)] = true;

        emit PoolCreated(
            address(newPool),
            _exchange,
            _pairTokenA,
            _pairTokenB,
            _chainId,
            block.timestamp
        );

        LMPool(newPool).grantRole(OWNER_ADMIN, msg.sender);
        return address(newPool);
    }

    function grantPoolRole(address poolAddress, bytes32 role, address account) external {
        require(LMPool(poolAddress).hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        LMPool(poolAddress).grantRole(role, account);
    }
    
}
