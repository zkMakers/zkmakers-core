pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// This contract is for demo purposes only
contract Token is ERC20 {
    constructor () ERC20("Token", "TKN") {
        _mint(msg.sender, 10000000000000000000000000000000000);
    }

    function burn(uint256 amount) public virtual {
        _burn(msg.sender, amount);
    }
}
