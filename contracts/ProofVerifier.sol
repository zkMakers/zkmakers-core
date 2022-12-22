// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./IProofVerifier.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract ProofVerifier is IProofVerifier {
    bytes32 public constant ORACLE_NODE = keccak256("ORACLE_NODE");
    address public factory;

    constructor(
        address _factory     
    ) {
        factory = _factory;
    }

    function verify(address sender, uint256 amount, uint256 nonce, uint256 proofTime, address pool, bytes32 uidHash, bytes calldata proof) override external view returns (address) {
        // This recreates the message that was signed on the oracles
        bytes32 message = prefixed(keccak256(abi.encodePacked(sender, amount, nonce, proofTime, pool, uidHash)));
        address signer = recoverSigner(message, proof);
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