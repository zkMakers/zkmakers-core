// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./ILMPoolFactory.sol";
import "./TransferHelper.sol";

contract LMPool {

    //ID OF THE CHAIN WHERE THE POOL IS DEPLOYED
    uint256 private CONTRACT_DEPLOYED_CHAIN;

    using Address for address payable;    

    // Info of each user.
    struct UserInfo {
        uint256 amount;     // How many points the user has provided.
        uint256 rewardDebt; // Reward debt.
    }
    // Epoch => Token Per Share
    mapping (uint256 => uint256) accTokenPerShare;
    uint256 lastRewardEpoch;
    // Wallet => Epoch => Info
    mapping (address => mapping (uint256 => UserInfo)) public userInfo;
    // Wallet => Total Points
    mapping (address => uint256) public userTotalPoints;
    // Epoch => Total Points
    mapping (uint256 => uint256) public totalPoints;
    //Exchange User Unique Identifier Hash => Wallet
    mapping (bytes32 => address) public exchangeUidUser;

    uint256 public lastEpoch;

    event Withdraw(address indexed user, uint256 amount);
    event PointsMinted(address indexed user, uint256 amount, address indexed signer);

    address public rewardToken;
    address public pairTokenA;
    address public pairTokenB;
    uint256 public chainId;
    uint256 public tokenDecimals;
    uint256 public startDate;
    address public factory;
    uint256 public epochDuration = 7 days;
    uint256 public delayClaim = 3 days; // We need to wait 3 days after the epoch for claiming
    uint256 public totalRewards;    
    
    //Amount available for promoters
    uint256 public promotersTotalRewards;

    mapping(uint256 => uint256) public promotersRewardPerEpoch;

    //Promoter => Epoch => Contribution amount
    mapping(address => mapping (uint256 => uint256)) public promoterEpochContribution;
    
    mapping (uint256 => uint256) public promotersEpochTotalContribution;


    //Amount available for promoters
    uint256 public oraclesTotalRewards;

    mapping(uint256 => uint256) public oraclesRewardPerEpoch;

    //Promoter => Epoch => Contribution amount
    mapping(address => mapping (uint256 => uint256)) public oraclesEpochContribution;
    
    mapping (uint256 => uint256) public oraclesEpochTotalContribution;

    mapping(uint256 => uint256) public rewardPerEpoch;

    mapping(uint256 => bool) public usedNonces;

    // User => Epoch => Last Proof Timestamp
    mapping(address => mapping(uint256 => uint256)) public lastProofTime;

    uint256 precision = 1e12;

    string public exchange;
    string public pair;

    function getChainID() internal view returns (uint256) {
        uint256 id;
        assembly {
            id := chainid()
        }
        return id;
    }

    constructor(
        address _factory,
        string memory _exchange,
        address _pairTokenA,
        address _pairTokenB,
        address _rewardToken,
        uint256 _chainId        
    ) {
        CONTRACT_DEPLOYED_CHAIN = getChainID();
        factory = _factory;
        exchange = _exchange;
        pairTokenA = _pairTokenA;
        pairTokenB = _pairTokenB;
        chainId = _chainId;
        if (chainId == CONTRACT_DEPLOYED_CHAIN){
            pair = string(abi.encodePacked(ERC20(_pairTokenA).symbol(),"/",ERC20(_pairTokenB).symbol()));
        }
        tokenDecimals = IERC20Metadata(_rewardToken).decimals();
        startDate = block.timestamp;
        rewardToken = _rewardToken;
    }

    function addRewards(uint256 amount, uint256 rewardDurationInEpochs, uint256 promotersRewards, uint256 oracleRewards) external {
        require(msg.sender == factory, "Only factory can add internal rewards");
        require(rewardDurationInEpochs <= 41, "Can't send more than 90 epochs at the same time");
        require(rewardDurationInEpochs > 0, "Can't divide by 0 epochs");
        uint256 currentEpoch = getCurrentEpoch();
                
        uint256 promotersRewardsPerEpoch = promotersRewards / rewardDurationInEpochs;
        promotersTotalRewards += promotersRewards;

        uint256 oraclesRewardsPerEpoch = oracleRewards / rewardDurationInEpochs;
        oraclesTotalRewards += oracleRewards;

        uint256 rewardsPerEpoch = amount / rewardDurationInEpochs;

        for (uint256 i = currentEpoch; i < currentEpoch + rewardDurationInEpochs; i++) {
            rewardPerEpoch[i] = rewardPerEpoch[i] + rewardsPerEpoch;
            promotersRewardPerEpoch[i] += promotersRewardsPerEpoch;
            oraclesRewardPerEpoch[i] += oraclesRewardsPerEpoch;
        }

        totalRewards = totalRewards + amount;
        if (currentEpoch + rewardDurationInEpochs > lastEpoch) {
            lastEpoch = currentEpoch + rewardDurationInEpochs;
        }
    }

    function submitProof(address sender, uint256 amount, uint256 nonce, uint256 proofTime, bytes32 uidHash, address promoter, address proofSigner) isPoolRunning external {
        require(msg.sender == factory, "Only factory can add proofs");
        require(!usedNonces[nonce], "Nonce already used");
        uint256 epoch = getEpoch(proofTime);
        require(!canClaimThisEpoch(epoch), "This epoch is already claimable");
        require(amount > 0, "Amount must be more than 0");        

        if (exchangeUidUser[uidHash] == address(0)){
            exchangeUidUser[uidHash] = sender;
        }
        
        require(exchangeUidUser[uidHash] == sender,"Only account owner can submit proof");        

        UserInfo storage user = userInfo[sender][epoch];

        usedNonces[nonce] = true;
        lastProofTime[sender][epoch] = proofTime;

        updatePool(epoch);

        if (user.amount > 0) {
            uint256 remainingRewards = totalRewards;
            uint256 pending = (user.amount * accTokenPerShare[epoch] / precision) - user.rewardDebt;

            if (remainingRewards == 0) {
                pending = 0;
            } else if (pending > remainingRewards) {
                pending = remainingRewards;
            }

            if (pending > 0) {
                TransferHelper.safeTransfer(rewardToken, address(sender), pending);
            }
        }
        
        user.amount = user.amount + amount;
        user.rewardDebt = user.amount * accTokenPerShare[epoch] / precision;
        userTotalPoints[sender] = userTotalPoints[sender] + amount;

        totalPoints[epoch] = totalPoints[epoch] + amount;

        //Update promoter epoch balance & epoch total balance
        promoterEpochContribution[promoter][epoch] += amount;
        promotersEpochTotalContribution[epoch] += amount;

        //Update oracles epoch balance & epoch total balance
        oraclesEpochContribution[proofSigner][epoch] += amount;
        oraclesEpochTotalContribution[epoch] += amount;

        emit PointsMinted(sender, amount, proofSigner);
    }

    function pendingOracleReward(address _user, uint256 epoch) public view returns (uint256) {
        uint256 percentage = oraclesEpochContribution[_user][epoch] * 100 / oraclesEpochTotalContribution[epoch];
        return oraclesRewardPerEpoch[epoch] * percentage / 100;
    }

    function pendingRebateReward(address _user, uint256 epoch) public view returns (uint256) {
        uint256 percentage = promoterEpochContribution[_user][epoch] * 100 / promotersEpochTotalContribution[epoch];
        return promotersRewardPerEpoch[epoch] * percentage / 100;
    }

    function pendingReward(address _user, uint256 epoch) external view returns (uint256) {
        UserInfo storage user = userInfo[_user][epoch];

        uint256 tokenPerShare = accTokenPerShare[epoch];
        uint256 currentEpoch = getCurrentEpoch();

        if (currentEpoch > lastRewardEpoch && totalPoints[epoch] != 0) {
            uint256 multiplier = currentEpoch - lastRewardEpoch;
            uint256 reward = multiplier * getRewardsPerEpoch(epoch);
            tokenPerShare = tokenPerShare + (reward * precision / totalPoints[epoch]);
        }

        uint256 remainingRewards = totalRewards;
        uint256 rewards = (user.amount * tokenPerShare / precision) - user.rewardDebt;

        if (remainingRewards == 0) {
            rewards = 0;
        } else if (rewards > remainingRewards) {
            rewards = remainingRewards;
        }

        return rewards;
    }

    function getRewardToken() public view returns (address) {
        return rewardToken;
    }

    function getStartDate() public view returns (uint256) {
        return startDate;
    }
    
    function getEpochDuration() public view returns (uint256) {
        return epochDuration;
    }

    function getLastEpoch() public view returns (uint256) {
        return lastEpoch;
    }

    function getRewardsPerEpoch(uint256 epoch) public view returns (uint256) {
        return rewardPerEpoch[epoch];
    }

    function getPromoterEpochContribution(address promoter,uint256 epoch) public view returns (uint256) {
        return promoterEpochContribution[promoter][epoch];
    }

    function getPromotersEpochTotalContribution(uint256 epoch) public view returns (uint256) {
        return promotersEpochTotalContribution[epoch];
    }

    function getOracleEpochContribution(address oracle,uint256 epoch) public view returns (uint256) {
        return oraclesEpochContribution[oracle][epoch];
    }

    function getOraclesEpochTotalContribution(uint256 epoch) public view returns (uint256) {
        return oraclesEpochTotalContribution[epoch];
    }

    function canClaimThisEpoch(uint256 epoch) public view returns (bool) {
        return getCurrentEpochEnd() >= delayClaim + getEpochEnd(epoch);
    }

    function multiClaim(uint256[] calldata epochs) external {
        for (uint256 i = 0; i < epochs.length; i++) {
            claim(epochs[i]);
        }
    }

    function multiClaimRebateRewards(uint256[] calldata epochs) external {
        for (uint256 i = 0; i < epochs.length; i++) {
            claimRebateRewards(epochs[i]);
        }
    }

    function multiClaimOracleRewards(uint256[] calldata epochs) external {
        for (uint256 i = 0; i < epochs.length; i++) {
            claimOracleRewards(epochs[i]);
        }
    }

    function claimOracleRewards(uint256 epoch) public {
        require(canClaimThisEpoch(epoch), "This epoch is not claimable");
        require(oraclesEpochContribution[msg.sender][epoch] > 0, "No rewards to claim in the given epoch");
        
        uint256 amount = pendingOracleReward(msg.sender, epoch);

        //Update balances        
        oraclesEpochContribution[msg.sender][epoch] = 0;
        oraclesTotalRewards -= amount;

        TransferHelper.safeTransfer(rewardToken, address(msg.sender), amount);

        emit Withdraw(msg.sender, amount);
    }

    function claimRebateRewards(uint256 epoch) public {
        require(canClaimThisEpoch(epoch), "This epoch is not claimable");
        require(promoterEpochContribution[msg.sender][epoch] > 0, "No rewards to claim in the given epoch");
        
        uint256 amount = pendingRebateReward(msg.sender, epoch);

        //Update balances        
        promoterEpochContribution[msg.sender][epoch] = 0;
        promotersTotalRewards -= amount;

        TransferHelper.safeTransfer(rewardToken, address(msg.sender), amount);

        emit Withdraw(msg.sender, amount);
    }

    function claim(uint256 epoch) public {
        require(canClaimThisEpoch(epoch), "This epoch is not claimable");

        UserInfo storage user = userInfo[msg.sender][epoch];
        updatePool(epoch);
        uint256 totalRewardsForUser = user.amount * accTokenPerShare[epoch] / 1e12;
        uint256 pending = totalRewardsForUser - user.rewardDebt;
        user.rewardDebt = totalRewardsForUser;
        if(pending > 0) {
            TransferHelper.safeTransfer(rewardToken, address(msg.sender), pending);
        }

        emit Withdraw(msg.sender, pending);
    }

    function getCurrentEpochEnd() public view returns (uint256) {
        return getEpochEnd(getCurrentEpoch());
    }

    function getEpochEnd(uint256 epoch) public view returns (uint256) {
        return startDate + (epochDuration * epoch);
    }

    function getProofTimeInverval(uint256 epoch, address user) public view returns (uint256 start, uint256 end) {
        uint256 epochEnd = getEpochEnd(epoch);
        uint256 epochStart = epochEnd - epochDuration;
        uint256 storedLastTime = lastProofTime[user][epoch];
        uint256 currentTime = block.timestamp;
        if (storedLastTime > 0) {
            epochStart = storedLastTime;
        }
        if (epochEnd > currentTime) {
            epochEnd = currentTime;
        }
        return (epochStart, epochEnd);
    }

    function getCurrentEpoch() public view returns (uint256) {
        return getEpoch(block.timestamp);
    }

    function getEpoch(uint256 timestamp) public view returns (uint256) {
        if (timestamp < startDate) {
            return 0;
        }
        uint256 timePassed = timestamp - startDate;
        return timePassed / epochDuration + 1;
    }

    // Update reward variables 
    function updatePool(uint256 epoch) public {
        uint256 currentEpoch = getCurrentEpoch();
        if (currentEpoch <= lastRewardEpoch) {
            return;
        }

        if (totalPoints[epoch] == 0) {
            lastRewardEpoch = currentEpoch;
            return;
        }

        uint256 multiplier = currentEpoch - lastRewardEpoch;
        uint256 reward = multiplier * getRewardsPerEpoch(epoch);
        accTokenPerShare[epoch] = accTokenPerShare[epoch] + (reward * precision/ totalPoints[epoch]);
        lastRewardEpoch = currentEpoch;
    }

    function isActive()
        public
        view
        returns(bool)
    {
        return (
            totalRewards > 0 && block.timestamp >= startDate
            && getCurrentEpoch() <= lastEpoch
        );
    }

    modifier isPoolRunning() {
        require(isActive(), 'LMPool: Pool has not started');
        _;
    }
}
