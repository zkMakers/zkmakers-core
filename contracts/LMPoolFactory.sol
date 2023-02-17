// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./LMPool.sol";
import "./ILMPoolFactory.sol";
import "./TransferHelper.sol";
import "./ProofVerifier.sol";

contract LMPoolFactory is ILMPoolFactory, Ownable, AccessControl {
    bytes32 public constant OWNER_ADMIN = keccak256("OWNER_ADMIN");
    bytes32 public constant ORACLE_NODE = keccak256("ORACLE_NODE");
    uint8 public constant POOL_TYPE_VOLUME = 0;
    uint8 public constant POOL_TYPE_LIQUIDITY = 1;


    //ID OF THE CHAIN WHERE THE FACTORY IS DEPLOYED
    uint256 private immutable CONTRACT_DEPLOYED_CHAIN;

    address[] public allPools;
    
    //Fee for reward token
    uint256 public fee = 900; // 9%
    uint256 public constant maxFee = 2700; // 27%

    //Promoters fee
    uint256 public promotersFee = 100; // 1%
    uint256 public constant maxPromotersFee = 300; //3%

    //Oracle fee
    uint256 public oracleFee = 100; // 1%
    uint256 public constant maxOracleFee = 300; // 3%
    
    //Fee for reward with custom token
    uint256 public customTokenFee = 1900; // 19%
    uint256 public constant maxCustomTokenFee = 4000; //40%

    // ERC20 => Accepted
    mapping(address => bool) public acceptedRewardTokens;

    // CHAIN ID => Accepted
    mapping(uint32 => bool) public acceptedBlockchains;

    mapping(string => bool) public acceptedExchanges;
    mapping(address => bool) public pools;
    ProofVerifier public proofVerifier;

    // Token A -> Token B -> Reward Token -> Exchange -> Type -> Pool
    mapping(address => mapping(address => mapping(address => mapping(string => mapping(uint8 => address))))) public getPool;

    event PoolCreated(
        address indexed pool,
        address pairTokenA,
        address pairTokenB,
        uint32 chainId,
        uint256 created,
        string exchange,
        address creator,
        address rewardToken,
        uint8 poolType
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

    event PointsRewarded(
        address indexed pool,
        address indexed promoter,
        address indexed proofSigner,
        uint256 amount,
        uint256 epoch,
        uint256 created
    );

    event RewardTokenStatus(
        address indexed token,
        bool accepted
    );

    event FeeSetted(
        uint indexed fee,
        string feeType
    );

    event BlockchainStatus(
        uint256 indexed chainId,
        bool added
    );

    event ExchangeStatus(
        string exchange,
        bool added
    );

    event ProofVerifierSetted(
        ProofVerifier proofVerifier
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

    function getPromotersFee() external view returns (uint256) {
        return promotersFee;
    }

    function getOracleFee() external view returns (uint256) {
        return promotersFee;
    }

    function getCustomTokenFee() external view returns (uint256) {
        return customTokenFee;
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
        emit RewardTokenStatus(token, true);
    }

    function rejectRewardToken(address token) external onlyAdmin {
        acceptedRewardTokens[token] = false;
        emit RewardTokenStatus(token, false);
    }

    function withdraw(address token, address receiver, uint256 amount) external onlyAdmin {
        SafeERC20.safeTransfer(IERC20(token),receiver, amount);
    }

    function setFee(uint256 amount) external onlyAdmin {
        require(amount <= maxFee,"LMPoolFactory: fee exceeds max permitted");
        fee = amount;
        emit FeeSetted(fee,"Pool fee");
    }

    function setPromotersFee(uint256 amount) external onlyAdmin {
        require(amount <= maxPromotersFee,"LMPoolFactory: promoters fee exceeds max permitted");
        promotersFee = amount;
        emit FeeSetted(promotersFee,"Promoter fee");
    }

    function setOracleFee(uint256 amount) external onlyAdmin {
        require(amount <= maxOracleFee,"LMPoolFactory: oracle fee exceeds max permitted");
        oracleFee = amount;
        emit FeeSetted(oracleFee,"Oracle fee");
    }

    function setCustomTokenFee(uint256 amount) external onlyAdmin {
        require(amount <= maxCustomTokenFee,"LMPoolFactory: custom token fee exceeds max permitted");
        customTokenFee = amount;
        emit FeeSetted(customTokenFee,"Custom token fee");
    }

    function setProofVerifier(ProofVerifier newProofVerifier) external onlyAdmin {
        proofVerifier = newProofVerifier;
        emit ProofVerifierSetted(newProofVerifier);
    }
    
    function getProofVerifier() override external view returns (IProofVerifier) {
        return proofVerifier;
    }

    function addBlockchain(uint32 chainId) external onlyAdmin {
        acceptedBlockchains[chainId] = true;
        emit BlockchainStatus(chainId, true);
    }

    function removeBlockchain(uint32 chainId) external onlyAdmin {
        acceptedBlockchains[chainId] = false;
        emit BlockchainStatus(chainId, false);
    }

    function addExchange(string calldata name) external onlyAdmin {
        acceptedExchanges[name] = true;
        emit ExchangeStatus(name, true);
    }

    function removeExchange(string calldata name) external onlyAdmin {
        acceptedExchanges[name] = false;
        emit ExchangeStatus(name, false);
    }

    function addRewards(address pool, uint256 amount, uint256 rewardDurationInEpochs) public {
        require(pools[pool], "Pool not found");
        LMPool poolImpl = LMPool(pool);
        address rewardToken = poolImpl.getRewardToken();
        
        //If reward token is one of the pair, the pool fee is the customTokenFee
        uint256 poolFee = acceptedRewardTokens[rewardToken] ? fee : customTokenFee;        
        uint256 feeAmount = (amount * poolFee) / 10000;
        
        //Calculates amount of rewards for promoters
        uint256 promotersRewards = (amount * promotersFee) / 10000;

        //Calculates amount of rewards for oracles
        uint256 oracleRewards = (amount * oracleFee) / 10000;        
        
        uint256 rewards = amount - feeAmount - promotersRewards - oracleRewards;
        
        TransferHelper.safeTransferFrom(poolImpl.getRewardToken(), msg.sender, address(this), feeAmount);
        TransferHelper.safeTransferFrom(poolImpl.getRewardToken(), msg.sender, address(pool), (rewards + promotersRewards + oracleRewards));        
        poolImpl.addRewards(rewards, rewardDurationInEpochs, promotersRewards, oracleRewards);

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
        require(promoter != address(0), "Promoter can't be the zero address");
        address proofSigner = proofVerifier.verify(msg.sender, amount, nonce, proofTime, pool, uidHash, proof);
        LMPool poolImpl = LMPool(pool);
        uint256 epoch = poolImpl.getEpoch(proofTime);
        poolImpl.submitProof(msg.sender, amount, nonce, proofTime, uidHash, promoter, proofSigner);
        emit PointsMinted(pool, msg.sender, amount, epoch, proofTime);
        emit PointsRewarded(pool, promoter, proofSigner, amount, epoch, proofTime);
    }

    function createDynamicPoolAndAddRewards(
        string calldata _exchange,        
        address _pairTokenA,
        address _pairTokenB,
        address _rewardToken,
        uint32 _chainId,
        uint256 _amount,
        uint256 _rewardDurationInEpochs,
        uint8 _poolType
    ) external returns(address) {
        address newPool = createDynamicPool(_exchange, _pairTokenA, _pairTokenB, _rewardToken, _chainId, _poolType);
        addRewards(newPool, _amount, _rewardDurationInEpochs);
        return newPool;
    }

    function createDynamicPool(
        string calldata _exchange,        
        address _pairTokenA,
        address _pairTokenB,
        address _rewardToken,
        uint32 _chainId,
        uint8 _poolType
    ) public returns(address) {
        require(
            acceptedRewardTokens[_rewardToken] ||
            (_chainId == CONTRACT_DEPLOYED_CHAIN && ( _rewardToken == _pairTokenA || _rewardToken == _pairTokenB)),
            "LMPoolFactory: Reward token is not accepted."
        );
        require(acceptedExchanges[_exchange], "LMPoolFactory: Exchange is not accepted.");
        require(acceptedBlockchains[_chainId], "LMPoolFactory: Blockchain is not accepted.");
        require(getPool[_pairTokenA][_pairTokenB][_rewardToken][_exchange][_poolType] == address(0), "LMPoolFactory: Pool already exists.");
        require(getPool[_pairTokenB][_pairTokenA][_rewardToken][_exchange][_poolType] == address(0), "LMPoolFactory: Pool already exists.");
        
        LMPool newPool = new LMPool(
            address(this),
            _exchange,
            _pairTokenA,
            _pairTokenB,
            _rewardToken,
            _chainId,
            _poolType
        );

        allPools.push(address(newPool));
        pools[address(newPool)] = true;

        getPool[_pairTokenA][_pairTokenB][_rewardToken][_exchange][_poolType] = address(newPool);
        getPool[_pairTokenB][_pairTokenA][_rewardToken][_exchange][_poolType] = address(newPool);

        emit PoolCreated(
            address(newPool),
            _pairTokenA,
            _pairTokenB,
            _chainId,
            block.timestamp,
            _exchange,
            msg.sender,
            _rewardToken,
            _poolType
        );

        return address(newPool);
    }

    modifier onlyAdmin() {
        require(hasRole(OWNER_ADMIN, msg.sender), "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
        _;
    }
    
}
