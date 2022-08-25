// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// This contract is for demo purposes only
contract PairTokenA is ERC20 {
    constructor () ERC20("Token A", "TKNA") {
        _mint(msg.sender, 10000000000000000000000000000000000);
    }

    function burn(uint256 amount) public virtual {
        _burn(msg.sender, amount);
    }
}
