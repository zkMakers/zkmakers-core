const { expectRevert, expectEvent, BN, time, ether, balance } = require('@openzeppelin/test-helpers');
const { expect, assert } = require('chai');

const LMPoolFactory = artifacts.require("LMPoolFactory");
const LMPool = artifacts.require("LMPool");
const Token = artifacts.require("mocks/Token.sol");
const OWNER_ADMIN = web3.utils.keccak256('OWNER_ADMIN');
const FACTORY_ADMIN = web3.utils.keccak256('FACTORY_ADMIN');
const DEFAULT_ADMIN = web3.utils.keccak256('DEFAULT_ADMIN_ROLE');

contract('Liquid Miners Pool Factory', function (accounts) {

  // Pool config
  const now = Math.floor(new Date().getTime() / 1000);
  const startDate = now + 300;  // In 5 minutes
  const duration = 3;
  
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
      duration,
      '1000000000000000000',
      { from: accounts[0] }
    );
    const { logs } = await this.lmPoolFactory.createDynamicPool(
      this.token.address,
      startDate,
      duration,
      '1000000000000000000',
      { from: accounts[0] }
    );

    this.lmPool = await LMPool.at(lmPoolAddress);
    this.logs = logs;

    // Approve
    this.token.approve(
      this.lmPool.address,
      '10000000000000000000000000000000000',
      { from: accounts[0] }
    );
  });

  describe('Create Pool', function () {

    it('PoolCreated Event', async function() {
      expectEvent.inLogs(this.logs, "PoolCreated", {
        pool: this.lmPool.address
      });
    });

    it('Account has OWNER_ADMIN role', async function() {
      assert.isTrue(
        await this.lmPool.hasRole(OWNER_ADMIN, accounts[0]).valueOf(),
        'Account has NOT OWNER_ADMIN role'
      );
    });

  });

  describe('Update Pool', function () {

    it('grantPoolRole grants on Pool', async function() {

      // Doesn't has the role
      assert.isFalse(
        await this.lmPool.hasRole(OWNER_ADMIN, accounts[7]).valueOf(),
        'Account has NOT OWNER_ADMIN role'
      );

      await this.lmPoolFactory.grantPoolRole(
        this.lmPool.address,
        OWNER_ADMIN,
        accounts[7],
        { from: accounts[0] }
      );

      // Has new role
      assert.isTrue(
        await this.lmPool.hasRole(OWNER_ADMIN, accounts[7]).valueOf(),
        'Account has NOT OWNER_ADMIN role'
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
