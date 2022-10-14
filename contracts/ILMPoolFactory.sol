// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IProofVerifier.sol";

interface ILMPoolFactory {
    function getProofVerifier() external view returns (IProofVerifier);
}
