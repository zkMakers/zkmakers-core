// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "./IProofVerifier.sol";

interface ILMPoolFactory {
    function getProofVerifier() external view returns (IProofVerifier);
}
