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
import "./ProofVerifier.sol";

contract LMPoolFactory is ILMPoolFactory, ReentrancyGuard, Ownable, AccessControl {
    bytes32 public constant OWNER_ADMIN = keccak256("OWNER_ADMIN");
    bytes32 public constant ORACLE_NODE = keccak256("ORACLE_NODE");

    //ID OF THE CHAIN WHERE THE FACTORY IS DEPLOYED
    uint256 private CONTRACT_DEPLOYED_CHAIN;

    address[] public allPools;
    
    //Fee for reward token
    uint256 fee = 1000; // 10%

    //Promoters fee
    uint256 promotersFee = 100; // 1%
    
    //Fee for reward with custom token
    uint256 customTokenFee = 2000; // 2%

    // ERC20 => Accepted
    mapping(address => bool) public acceptedRewardTokens;

    // CHAIN ID => Accepted
    mapping(uint32 => bool) public acceptedBlockchains;

    mapping(string => bool) public acceptedExchanges;
    mapping(address => bool) public pools;
    ProofVerifier public proofVerifier;

    // Token A -> Token B -> Reward Token -> Exchange -> Pool
    mapping(address => mapping(address => mapping(address => mapping(string => address)))) public getPool;

    event PoolCreated(
        address indexed pool,
        address pairTokenA,
        address pairTokenB,
        uint32 chainId,
        uint256 created,
        string exchange
    );

    event RewardsAdded(
        address indexed pool,
        uint256 endRewardsDate,
        uint256 created,
        uint256 firstEpoch,
        uint256 lastEpoch,
        uint256 amount,
        uint256 startRewardsDate
    );

    event PointsMinted(
        address indexed pool,
        address indexed user,
        uint256 amount,
        uint256 epoch,
        uint256 created
    );

    constructor() {
        _grantRole(OWNER_ADMIN, msg.sender);
        CONTRACT_DEPLOYED_CHAIN = getChainID();
        proofVerifier = new ProofVerifier(address(this));
    }

    function getChainID() internal view returns (uint256) {
        uint256 id;
        assembly {
            id := chainid()
        }
        return id;
    }

    function getFee() external view returns (uint256) {
        return fee;
    }

    function addOwner(address owner) external onlyAdmin {
        _grantRole(OWNER_ADMIN, owner);
    }

    function removeOwner(address owner) external onlyAdmin {
        _revokeRole(OWNER_ADMIN, owner);
    }

    function createOracle(address oracle) external onlyAdmin {
        _grantRole(ORACLE_NODE, oracle);
    }

    function removeOracle(address oracle) external onlyAdmin {
        _revokeRole(ORACLE_NODE, oracle);
    }

    function acceptRewardToken(address token) external onlyAdmin {
        acceptedRewardTokens[token] = true;
    }

    function rejectRewardToken(address token) external onlyAdmin {
        acceptedRewardTokens[token] = false;
    }

    function withdraw(address token, address receiver, uint256 amount) external onlyAdmin {
        IERC20(token).transfer(receiver, amount);
    }

    function setFee(uint256 amount) external onlyAdmin {
        fee = amount;
    }

    function setCustomTokenFee(uint256 amount) external onlyAdmin {
        customTokenFee = amount;
    }

    function setProofVerifier(ProofVerifier newProofVerifier) external onlyAdmin {
        proofVerifier = newProofVerifier;
    }
    
    function getProofVerifier() override external view returns (IProofVerifier) {
        return proofVerifier;
    }

    function addBlockchain(uint32 chainId) external onlyAdmin {
        acceptedBlockchains[chainId] = true;
    }

    function removeBlockchain(uint32 chainId) external onlyAdmin {
        acceptedBlockchains[chainId] = false;
    }

    function addExchange(string calldata name) external onlyAdmin {
        acceptedExchanges[name] = true;
    }

    function removeExchange(string calldata name) external onlyAdmin {
        acceptedExchanges[name] = false;
    }

    function addRewards(address pool, uint256 amount, uint256 rewardDurationInEpochs) external {
        require(pools[pool], "Pool not found");
        LMPool poolImpl = LMPool(pool);
        address rewardToken = poolImpl.getRewardToken();
        
        //If reward token is one of the pair, the pool fee is the customTokenFee
        uint256 poolFee = acceptedRewardTokens[rewardToken] ? fee : customTokenFee;        
        uint256 feeAmount = (amount * poolFee) / 10000;
        
        //Calculates amount of rewards for promoters
        uint256 promotersRewards = (amount * promotersFee) / 10000;

        uint256 rewards = amount - feeAmount - promotersRewards;
        
        TransferHelper.safeTransferFrom(poolImpl.getRewardToken(), msg.sender, address(this), feeAmount);
        TransferHelper.safeTransferFrom(poolImpl.getRewardToken(), msg.sender, address(pool), (rewards + promotersRewards));        
        poolImpl.addRewards(rewards, rewardDurationInEpochs, promotersRewards);

        uint256 firstEpoch = poolImpl.getCurrentEpoch();

        emit RewardsAdded(
            pool,
            poolImpl.getStartDate() + poolImpl.getEpochDuration() * poolImpl.getLastEpoch(),
            block.timestamp,
            firstEpoch,
            firstEpoch + rewardDurationInEpochs - 1,
            rewards,
            poolImpl.getStartDate() + poolImpl.getEpochDuration() * firstEpoch
        );
    }

    function submitProof(address pool, uint256 amount, uint256 nonce, uint256 proofTime, bytes calldata proof, bytes32 uidHash, address promoter) external {
        require(pools[pool], "Pool not found");
        LMPool poolImpl = LMPool(pool);
        poolImpl.submitProof(msg.sender, amount, nonce, proofTime, proof, uidHash, promoter);
        emit PointsMinted(pool, msg.sender, amount, poolImpl.getEpoch(proofTime), proofTime);
    }

    function createDynamicPool(
        string calldata _exchange,        
        address _pairTokenA,
        address _pairTokenB,
        address _rewardToken,
        uint32 _chainId
    ) external returns(address) {
        require(acceptedRewardTokens[_rewardToken] ||
                (_chainId == CONTRACT_DEPLOYED_CHAIN &&
                _rewardToken == _pairTokenA || 
                _rewardToken == _pairTokenB), "LMPoolFactory: Reward token is not accepted.");
        require(acceptedExchanges[_exchange], "LMPoolFactory: Exchange is not accepted.");
        require(acceptedBlockchains[_chainId], "LMPoolFactory: Blockchain is not accepted.");
        require(getPool[_pairTokenA][_pairTokenB][_rewardToken][_exchange] == address(0), "LMPoolFactory: Pool already exists");
        require(getPool[_pairTokenB][_pairTokenA][_rewardToken][_exchange] == address(0), "LMPoolFactory: Pool already exists");
        
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

        getPool[_pairTokenA][_pairTokenB][_rewardToken][_exchange] = address(newPool);
        getPool[_pairTokenB][_pairTokenA][_rewardToken][_exchange] = address(newPool);

        emit PoolCreated(
            address(newPool),
            _pairTokenA,
            _pairTokenB,
            _chainId,
            block.timestamp,
            _exchange
        );

        return address(newPool);
    }

    modifier onlyAdmin() {
        require(hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        _;
    }
    
}
