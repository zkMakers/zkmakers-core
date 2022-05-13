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
    bytes32 public constant ORACLE_NODE = keccak256("ORACLE_NODE");

    using Address for address payable;

    // Info of each user.
    struct UserInfo {
        uint256 amount;     // How many points the user has provided.
        uint256 rewardDebt; // Reward debt.
    }
    uint256 accTokenPerShare;
    uint256 lastRewardEpoch;
    mapping (address => UserInfo) public userInfo;
    uint256 totalPoints;

    event Withdraw(address indexed user, uint256 amount);
    event MintPoints(address indexed user, uint256 amount);

    address public rewardToken;
    uint256 public tokenDecimals;
    uint256 public startDate;
    uint256 public endDate;
    uint256 public rewardPerEpoch;
    address public factory;
    uint256 public epochDuration = 24 hours;
    uint256 public delayClaimEpoch = 7; // We need to wait to epoch to claim the rewards
    uint256 public totalRewards;

    mapping(uint256 => bool) public usedNonces;

    // User => Last Proof Timestamp
    mapping(address => uint256) public lastProofTime;

    uint256 precision = 1e12;

    constructor(
        address _factory,
        address _rewardToken,
        uint256 _startDate,
        uint256 _endDate,
        uint256 _rewardPerEpoch
    ) {
        _factory = factory;
        tokenDecimals = IERC20Metadata(_rewardToken).decimals();
        startDate = _startDate;
        rewardToken = _rewardToken;
        endDate = _endDate;
        rewardPerEpoch = _rewardPerEpoch;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function addRewards(uint256 amount) external {
        IERC20(rewardToken).transferFrom(msg.sender, address(this), amount);
        // ToDo transfer fee to treasury
        totalRewards = totalRewards + amount;
    }

    function submitProof(uint256 amount, uint256 nonce, uint256 proofTime, bytes calldata sig) isPoolRunning external {
        require(!usedNonces[nonce], "Nonce already used");
        UserInfo storage user = userInfo[msg.sender];

        usedNonces[nonce] = true;
        lastProofTime[msg.sender] = proofTime;

        // This recreates the message that was signed on the oracles
        bytes32 message = prefixed(keccak256(abi.encodePacked(msg.sender, amount, nonce, proofTime, this)));

        require(AccessControl(factory).hasRole(ORACLE_NODE, recoverSigner(message, sig)), "Signature is not from an oracle");

        updatePool();

        if (user.amount > 0) {
            uint256 remainingRewards = totalRewards;
            uint256 pending = (user.amount * accTokenPerShare / precision) - user.rewardDebt;

            if (remainingRewards == 0) {
                pending = 0;
            } else if (pending > remainingRewards) {
                pending = remainingRewards;
            }

            if (pending > 0) {
                IERC20(rewardToken).transfer(address(msg.sender), pending);
                totalRewards = totalRewards - pending;
            }
        }
        if (amount > 0) {
            user.amount = user.amount + amount;
        }
        user.rewardDebt = user.amount * accTokenPerShare / precision;

        totalPoints = totalPoints + amount;

        emit MintPoints(msg.sender, amount);
    }

    function pendingReward(address _user) external view returns (uint256) {
        UserInfo storage user = userInfo[_user];

        uint256 tokenPerShare = accTokenPerShare;
        uint256 currentEpoch = getCurrentEpoch();

        if (currentEpoch > lastRewardEpoch && totalPoints != 0) {
            uint256 multiplier = currentEpoch - lastRewardEpoch;
            uint256 reward = multiplier * rewardPerEpoch;
            tokenPerShare = tokenPerShare + (reward * precision / totalPoints);
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

    function getCurrentEpochWithDelay() public view returns (uint256) {
        uint256 currentEpoch = getCurrentEpoch();
        if (currentEpoch <= delayClaimEpoch) {
            return 0;
        }
        return currentEpoch - delayClaimEpoch;
    }

    function getCurrentEpoch() public view returns (uint256) {
        uint256 currentTime = block.timestamp;
        if (currentTime < startDate) {
            return 0;
        }
        uint256 timePassed = currentTime - startDate;
        return timePassed / epochDuration;
    }

    // Update reward variables 
    function updatePool() public {
        uint256 currentEpoch = getCurrentEpoch();
        if (currentEpoch <= lastRewardEpoch) {
            return;
        }

        if (totalPoints == 0) {
            lastRewardEpoch = currentEpoch;
            return;
        }

        uint256 multiplier = currentEpoch - lastRewardEpoch;
        uint256 reward = multiplier * rewardPerEpoch;
        accTokenPerShare = accTokenPerShare + (reward * precision/ totalPoints);
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
            && block.timestamp < endDate
        );
    }

    modifier isPoolRunning() {
        require(isActive(), 'LMPool: Pool has not started');
        _;
    }
}
