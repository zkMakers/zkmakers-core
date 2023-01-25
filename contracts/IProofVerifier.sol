// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

interface IProofVerifier {
    /**
    * Checks if the proof is correct and returns the signer. This method should revert if the signer is invalid.
    * Format of the signature, using EIP-712:
    *
    * EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)
    * Example: LiquidMiners, 1, chainId, poolAddres
    *
    * Proof(address senderAddress,uint256 totalPoints,uint256 nonce,uint256 lastProofTime,address poolAddress,bytes32 uidHash)
    */
    function verify(address sender, uint256 amount, uint256 nonce, uint256 proofTime, address pool, bytes32 uidHash, bytes calldata proof) external view returns (address);
}
