// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

contract Migrations {
  address public owner;
  uint public last_completed_migration;

  event MigrationCompleted(
    uint indexed completed
  );

  modifier restricted() {
    if (msg.sender == owner) _;
  }

  constructor() {
    owner = msg.sender;
  }

  function setCompleted(uint completed) public restricted {
    last_completed_migration = completed;
    emit MigrationCompleted(completed);
  }
}
