const { expectRevert, expectEvent, BN, time, ether, balance } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const LMPoolFactory = artifacts.require("LMPoolFactory");
const LMPool = artifacts.require("LMPool");
const Token = artifacts.require("mocks/Token.sol");

contract('Liquid Miners Pool', function (accounts) {

  // Pool config
  const now = Math.floor(new Date().getTime() / 1000);

  const startDate = now + 300;  // In 5 minutes
  const endDate = now + 1800;   // In 30 minutes

  beforeEach(async function () {
    // Token
    this.token = await Token.new(
      { from: accounts[0] }
    );

    // Factory
    this.lmPoolFactory = await LMPoolFactory.new(
      { from: accounts[0] }
    );
    
    await this.lmPoolFactory.acceptRewardToken(
      this.token.address,
      { from: accounts[0] }
    );

    // Pool
    const lmPoolAddress = await this.lmPoolFactory.createDynamicPool.call(
      this.token.address,
      startDate,
      endDate,
      '1000000000000000000',
      { from: accounts[0] }
    );
    await this.lmPoolFactory.createDynamicPool(
      this.token.address,
      startDate,
      endDate,
      '1000000000000000000',
      { from: accounts[0] }
    );
    
    this.lmPool = await LMPool.at(lmPoolAddress);

    // Approve
    this.token.approve(
      this.lmPool.address,
      '10000000000000000000000000000000000',
      { from: accounts[0] }
    );

    await takeSnapshot();
  });

  afterEach(async function () {    
    await restoreSnapshot();
  });

  describe('Simple pool', function () {


    it('isActive after addRewards but not starttime', async function() {
      await this.lmPool.addRewards('10000000000000000000000000000000000', { from: accounts[0] });

      assert.isFalse(
        await this.lmPool.isActive(),
        'isActive value is wrong'
      );
    });


    it('isActive after starttime but not funded with rewards', async function() {
      await time.increase(time.duration.minutes(6));

      assert.isFalse(
        await this.lmPool.isActive(),
        'isActive value is wrong'
      );
    });

    it('isActive after fund rewards and starttime', async function() {
      await this.lmPool.addRewards('10000000000000000000000000000000000', { from: accounts[0] });

      await time.increase(time.duration.minutes(6));

      assert.isTrue(
        await this.lmPool.isActive(),
        'isActive value is wrong'
      );
    });

  });

});

function sumStrings(a,b) { 
  return ((BigInt(a)) + BigInt(b)).toString();
}

function subStrings(a,b) { 
  return ((BigInt(a)) - BigInt(b)).toString();
}

function mulStrings(a,b) { 
  return ((BigInt(a)) * BigInt(b)).toString();
}

function divStrings(a,b) { 
  return ((BigInt(a)) / BigInt(b)).toString();
}

restoreSnapshot = () => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send({jsonrpc: "2.0", method: "evm_revert", params: [snapshotId]}, () => {
      resolve();
    });
  })
}

takeSnapshot = () => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send({jsonrpc: "2.0", method: "evm_snapshot"}, (err, result) => {
      snapshotId = result.result;
      resolve();
    });
  })
}
