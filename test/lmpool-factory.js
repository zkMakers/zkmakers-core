const { expectRevert, expectEvent, BN, time, ether, balance } = require('@openzeppelin/test-helpers');
const { expect, assert } = require('chai');

const LMPoolFactory = artifacts.require("LMPoolFactory");
const LMPool = artifacts.require("LMPool");
const Token = artifacts.require("mocks/Token.sol");
const PairTokenA = artifacts.require("mocks/PairTokenA.sol");
const PairTokenB = artifacts.require("mocks/PairTokenB.sol");
const OWNER_ADMIN = web3.utils.keccak256('OWNER_ADMIN');
const FACTORY_ADMIN = web3.utils.keccak256('FACTORY_ADMIN');
const DEFAULT_ADMIN = web3.utils.keccak256('DEFAULT_ADMIN_ROLE');

contract('Liquid Miners Pool Factory', function (accounts) {

  // Pool config
  const now = Math.floor(new Date().getTime() / 1000);

  const chainId = 56;
  
  beforeEach(async function () {
    // Token
    this.token = await Token.new(
      { from: accounts[0] }
    );

    //Pair Tokens
    this.tokenA = await PairTokenA.new(
      { from: accounts[0] }
    );

    this.tokenB = await PairTokenB.new(
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

    await this.lmPoolFactory.addBlockchain(
      chainId,
      { from: accounts[0] }
    );
    
    await this.lmPoolFactory.addExchange(
      "gate",
      { from: accounts[0] }
    );

    // Pool
    const lmPoolAddress = await this.lmPoolFactory.createDynamicPool.call(
      "gate",
      this.tokenA.address,
      this.tokenB.address,
      this.token.address,
      chainId,
      { from: accounts[0] }
    );
    const { logs } = await this.lmPoolFactory.createDynamicPool(
      "gate",
      this.tokenA.address,
      this.tokenB.address,
      this.token.address,
      chainId,
      { from: accounts[0] }
    );

    this.lmPool = await LMPool.at(lmPoolAddress);
    this.logs = logs;

    // Approve
    this.token.approve(
      this.lmPoolFactory.address,
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

    it('should withdraw', async function() {      
      await this.lmPoolFactory.addRewards(this.lmPool.address, '100000000000000000000000000', 3, { from: accounts[0], gasLimit: 1000000 });
      // assert.equal((await this.token.balanceOf(accounts[0])).toString(), '9999999900000000000000000000000000', 'Incorrect balance');

      // await this.lmPoolFactory.withdraw(this.token.address, accounts[0], '10000000000000000000000000', { from: accounts[0], gasLimit: 1000000 });
      // assert.equal((await this.token.balanceOf(accounts[0])).toString(), '9999999910000000000000000000000000', 'Incorrect balance');
    });

  });

});

function sumStrings(a,b) { 
  return ((BigInt(a)) + BigInt(b)).toString();
}

function subStrings(a,b) { 
  return ((BigInt(a)) - BigInt(b)).toString();
}
