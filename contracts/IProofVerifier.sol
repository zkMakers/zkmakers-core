// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

interface IProofVerifier {
    /**
    * Checks if the proof is correct and returns the signer. This method should revert if the signer is invalid.
    * Format of the signature:
    *   ['address', 'uint256', 'uint256', 'uint256', 'address', 'bytes32'],
    *   [
    *       senderAddress,
    *       totalPoints,
    *       nonce,
    *       lastProofTime,
    *       poolAddress,
    *       uidHash,
    *   ]
    */
    function verify(address sender, uint256 amount, uint256 nonce, uint256 proofTime, address pool, bytes32 uidHash, bytes calldata proof) external view returns (address);
}
