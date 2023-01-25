// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./IProofVerifier.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract ProofVerifier is IProofVerifier {
    bytes32 public constant ORACLE_NODE = keccak256("ORACLE_NODE");
    address public factory;
    bytes32 private immutable nameHash;
    bytes32 private immutable versionHash;

    constructor(
        address _factory     
    ) {
        factory = _factory;
        nameHash = keccak256(bytes("LiquidMiners"));
        versionHash = keccak256(bytes("1"));
    }

    function verify(address sender, uint256 amount, uint256 nonce, uint256 proofTime, address pool, bytes32 uidHash, bytes calldata proof) override external view returns (address) {

        uint chainId;
        assembly {
            chainId := chainid()
        }
        
        bytes32 domain = keccak256(
            abi.encode(
                // @dev Value is equal to keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
                0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f,
                nameHash,
                versionHash,
                chainId,
                pool
            )
        );

        // @dev Value is equal to keccak256("Proof(address senderAddress,uint256 totalPoints,uint256 nonce,uint256 lastProofTime,address poolAddress,bytes32 uidHash)");
        bytes32 typeHash = 0xf6aea6f9b6628452190f157785013d7be643264b290b065c9fbba0b4feb914f3;

        bytes32 data = keccak256(abi.encode(typeHash, sender, amount, nonce, proofTime, pool, uidHash));
        bytes32 digest =
            keccak256(
                abi.encodePacked(
                    '\x19\x01',
                    domain,
                    data
                )
            );

        address signer = recoverSigner(digest, proof);
        require(AccessControl(factory).hasRole(ORACLE_NODE, signer), "Signature is not from a valid oracle");
        return signer;
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
}