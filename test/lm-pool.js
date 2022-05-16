const { expectRevert, expectEvent, BN, time, ether, balance } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const LMPoolFactory = artifacts.require("LMPoolFactory");
const LMPool = artifacts.require("LMPool");
const Token = artifacts.require("mocks/Token.sol");
const Signer = require('./signer');

contract('Liquid Miners Pool', function (accounts) {

  // Pool config
  const now = Math.floor(new Date().getTime() / 1000);

  const startDate = now + 300;  // In 5 minutes
  const proofTimeInFirstEpoch = now + 600; // In 6 mins
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

    await this.lmPoolFactory.addExchange(
      "gate",
      { from: accounts[0] }
    );

    // Pool
    this.lmPoolAddress = await this.lmPoolFactory.createDynamicPool.call(
      "gate",
      "eth/usdt",
      this.token.address,
      startDate,
      duration,
      { from: accounts[0] }
    );
    await this.lmPoolFactory.createDynamicPool(
      "gate",
      "eth/usdt",
      this.token.address,
      startDate,
      duration,
      { from: accounts[0] }
    );
    
    this.lmPool = await LMPool.at(this.lmPoolAddress);

    // Signer
    await web3.eth.accounts.wallet.create(1);
    this.signerAddress = web3.eth.accounts.wallet['0'].address;
    this.signer = new Signer(web3, web3.eth.accounts.wallet['0'].privateKey);

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
      await this.lmPool.addRewards('100000000000000000000000000', { from: accounts[0], gasLimit: 1000000 });

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
      await this.lmPool.addRewards('100000000000000000000000000', { from: accounts[0], gasLimit: 1000000 });

      await time.increase(time.duration.minutes(6));

      assert.isTrue(
        await this.lmPool.isActive(),
        'isActive value is wrong'
      );
    });

  });

  describe('Simple pool', function () {

    it('should throw error if we already reached claim time', async function() {
      await this.lmPool.addRewards('100000000000000000000000000', { from: accounts[0], gasLimit: 1000000 });

      await time.increase(time.duration.minutes(6));

      assert.isTrue(
        await this.lmPool.isActive(),
        'isActive value is wrong'
      );
      const signature = await this.signer.createSignature(accounts[2], 5, proofTimeInFirstEpoch, this.lmPoolAddress);


      await time.increase(time.duration.days(8));

      await expectRevert(
        this.lmPool.submitProof(signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,
          { from: accounts[2] }
        ),
        'This epoch is already claimable'
      );
    });

    it('should throw error if proof is not from oracle', async function() {
      await this.lmPool.addRewards('100000000000000000000000000', { from: accounts[0], gasLimit: 1000000 });

      await time.increase(time.duration.minutes(6));

      assert.isTrue(
        await this.lmPool.isActive(),
        'isActive value is wrong'
      );
      const signature = await this.signer.createSignature(accounts[2], 5, proofTimeInFirstEpoch, this.lmPoolAddress);

      await expectRevert(
        this.lmPool.submitProof(signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,
          { from: accounts[2] }
        ),
        'Signature is not from an oracle'
      );
    });

    it('should count points', async function() {
      await this.lmPool.addRewards('100000000000000000000000000', { from: accounts[0], gasLimit: 1000000 });

      await time.increase(time.duration.minutes(6));

      assert.isTrue(
        await this.lmPool.isActive(),
        'isActive value is wrong'
      );
      let signature = await this.signer.createSignature(accounts[2], 5, proofTimeInFirstEpoch, this.lmPoolAddress);

      assert.isFalse(await this.lmPoolFactory.hasRole(await this.lmPoolFactory.ORACLE_NODE.call(), this.signerAddress), 'Oracle is not correct');
      await this.lmPoolFactory.createOracle(this.signerAddress, { from: accounts[0] });
      assert.isTrue(await this.lmPoolFactory.hasRole(await this.lmPoolFactory.ORACLE_NODE.call(), this.signerAddress), 'Oracle is not correct');

      assert.equal(await this.lmPool.userTotalPoints(accounts[2]), '0', 'Incorrect user points');
      assert.equal(await this.lmPool.totalPoints(0), '0', 'Incorrect total points');
      assert.equal(await this.lmPool.totalPoints(1), '0', 'Incorrect total points');

      await this.lmPool.submitProof(signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,
        { from: accounts[2], gasLimit: 1000000 }
      );


      assert.equal(await this.lmPool.userTotalPoints(accounts[2]), '5000000000000000000', 'Incorrect user points');
      assert.equal(await this.lmPool.totalPoints(0), '5000000000000000000', 'Incorrect total points');
      assert.equal(await this.lmPool.totalPoints(1), '0', 'Incorrect total points');

      await expectRevert(
        this.lmPool.submitProof(signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,
          { from: accounts[2], gasLimit: 1000000 }
        ),
        'Nonce already used'
      );

      signature = await this.signer.createSignature(accounts[3], 5, proofTimeInFirstEpoch, this.lmPoolAddress);
      await this.lmPool.submitProof(signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,
        { from: accounts[3], gasLimit: 1000000 }
      );

      assert.equal(await this.lmPool.userTotalPoints(accounts[2]), '5000000000000000000', 'Incorrect user points');
      assert.equal(await this.lmPool.userTotalPoints(accounts[3]), '5000000000000000000', 'Incorrect user points');
      assert.equal(await this.lmPool.totalPoints(0), '10000000000000000000', 'Incorrect total points');
      assert.equal(await this.lmPool.totalPoints(1), '0', 'Incorrect total points');

      await expectRevert(
        this.lmPool.claim(0, { from: accounts[2], gasLimit: 1000000 }),
        'This epoch is not claimable'
      );
      await time.increase(time.duration.days(8));

      signature = await this.signer.createSignature(accounts[3], 5, proofTimeInFirstEpoch, this.lmPoolAddress);
      await expectRevert(
        this.lmPool.submitProof(signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,
          { from: accounts[3], gasLimit: 1000000 }
        ),
        'This epoch is already claimable'
      );

      assert.equal(await this.token.balanceOf(accounts[2]), '0', 'Incorrect reward balance');
      await this.lmPool.claim(0, { from: accounts[2], gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(accounts[2])).toString(), '15000000000000000000000000', 'Incorrect reward balance');


      await this.lmPool.claim(0, { from: accounts[2], gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(accounts[2])).toString(), '15000000000000000000000000', 'Incorrect reward balance');

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
