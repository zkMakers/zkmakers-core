// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LMXToken is ERC20 {
    constructor(uint256 totalSupply_) ERC20("Liquid Miners Token", "LMX") {
        _mint(msg.sender, totalSupply_);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}