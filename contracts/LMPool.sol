// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./ILMPoolFactory.sol";

contract LMPool is ReentrancyGuard, Ownable, AccessControl {
    bytes32 public constant OWNER_ADMIN = keccak256("OWNER_ADMIN");
    bytes32 public constant ORACLE_NODE = keccak256("ORACLE_NODE");

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

    event Withdraw(address indexed user, uint256 amount);
    event MintPoints(address indexed user, uint256 amount);

    address public rewardToken;
    uint256 public tokenDecimals;
    uint256 public startDate;
    uint256 public durationInEpochs;
    address public factory;
    uint256 public epochDuration = 7 days;
    uint256 public delayClaimEpoch = 1; // We need to wait to epoch to claim the rewards
    uint256 public totalRewards;

    mapping(uint256 => uint256) public rewardPerEpoch;

    mapping(uint256 => bool) public usedNonces;

    // User => Last Proof Timestamp
    mapping(address => uint256) public lastProofTime;

    uint256 precision = 1e12;

    constructor(
        address _factory,
        address _rewardToken,
        uint256 _startDate,
        uint256 _durationInEpochs
    ) {
        factory = _factory;
        tokenDecimals = IERC20Metadata(_rewardToken).decimals();
        startDate = _startDate;
        rewardToken = _rewardToken;
        durationInEpochs = _durationInEpochs;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function addRewards(uint256 amount) external {
        uint256 feeAmount = (amount * ILMPoolFactory(factory).getFee()) / 10000;
        uint256 rewards = amount - feeAmount;
        IERC20(rewardToken).transferFrom(msg.sender, factory, feeAmount);
        IERC20(rewardToken).transferFrom(msg.sender, address(this), rewards);

        uint256 currentEpoch = getCurrentEpoch();
        uint256 rewardsPerEpoch = rewards / (durationInEpochs - currentEpoch);
        for (uint256 i = currentEpoch; i < durationInEpochs; i++) {
            rewardPerEpoch[i] = rewardPerEpoch[i] + rewardsPerEpoch;
        }

        totalRewards = totalRewards + rewards;
    }

    function submitProof(uint256 amount, uint256 nonce, uint256 proofTime, bytes calldata sig) isPoolRunning external {
        require(!usedNonces[nonce], "Nonce already used");
        uint256 epoch = getEpoch(proofTime);
        require(!canClaimThisEpoch(epoch), "This epoch is already claimable");
        require(epoch <= durationInEpochs, "Pool ended");

        UserInfo storage user = userInfo[msg.sender][epoch];

        usedNonces[nonce] = true;
        lastProofTime[msg.sender] = proofTime;

        // This recreates the message that was signed on the oracles
        bytes32 message = prefixed(keccak256(abi.encodePacked(msg.sender, amount, nonce, proofTime, this)));

        require(AccessControl(factory).hasRole(ORACLE_NODE, recoverSigner(message, sig)), "Signature is not from an oracle");

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
                IERC20(rewardToken).transfer(address(msg.sender), pending);
            }
        }
        if (amount > 0) {
            user.amount = user.amount + amount;
        }
        user.rewardDebt = user.amount * accTokenPerShare[epoch] / precision;
        userTotalPoints[msg.sender] = userTotalPoints[msg.sender] + amount;

        totalPoints[epoch] = totalPoints[epoch] + amount;

        emit MintPoints(msg.sender, amount);
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

    function getRewardsPerEpoch(uint256 epoch) public view returns (uint256) {
        return rewardPerEpoch[epoch];
    }

    function multiClaim(uint256[] calldata epochs) external {
        for (uint256 i = 0; i < epochs.length; i++) {
            claim(epochs[i]);
        }
    }

    function canClaimThisEpoch(uint256 epoch) public view returns (bool) {
        uint256 currentEpoch = getCurrentEpoch();
        return delayClaimEpoch + epoch >= currentEpoch;
    }

    function claim(uint256 epoch) public {
        require(canClaimThisEpoch(epoch), "This epoch is not claimable");

        UserInfo storage user = userInfo[msg.sender][epoch];
        updatePool(epoch);
        uint256 pending = (user.amount * accTokenPerShare[epoch] / 1e12) - user.rewardDebt;
        if(pending > 0) {
            IERC20(rewardToken).transfer(address(msg.sender), pending);
        }
        user.rewardDebt = user.amount * accTokenPerShare[epoch] / 1e12;

        emit Withdraw(msg.sender, pending);
    }

    function getCurrentEpoch() public view returns (uint256) {
        return getEpoch(block.timestamp);
    }

    function getEpoch(uint256 timestamp) public view returns (uint256) {
        if (timestamp < startDate) {
            return 0;
        }
        uint256 timePassed = timestamp - startDate;
        return timePassed / epochDuration;
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


    // Signature methods
    function splitSignature(bytes memory sig)
        internal
        pure
        returns (uint8, bytes32, bytes32)
    {
        require(sig.length == 65);

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            // first 32 bytes, after the length prefix
            r := mload(add(sig, 32))
            // second 32 bytes
            s := mload(add(sig, 64))
            // final byte (first byte of the next 32 bytes)
            v := byte(0, mload(add(sig, 96)))
        }

        return (v, r, s);
    }

    function recoverSigner(bytes32 message, bytes memory sig)
        internal
        pure
        returns (address)
    {
        uint8 v;
        bytes32 r;
        bytes32 s;

        (v, r, s) = splitSignature(sig);

        return ecrecover(message, v, r, s);
    }

    // Builds a prefixed hash to mimic the behavior of eth_sign.
    function prefixed(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

    function isActive()
        public
        view
        returns(bool)
    {
        return (
            totalRewards > 0 && block.timestamp >= startDate
            && getCurrentEpoch() <= durationInEpochs
        );
    }

    modifier isPoolRunning() {
        require(isActive(), 'LMPool: Pool has not started');
        _;
    }
}
