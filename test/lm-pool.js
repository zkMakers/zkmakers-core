const { expectRevert, expectEvent, BN, time, ether, balance } = require('@openzeppelin/test-helpers');
const { expect, assert } = require('chai');

const LMPoolFactory = artifacts.require("LMPoolFactory");
const LMPool = artifacts.require("LMPool");
const Token = artifacts.require("mocks/Token.sol");
const PairTokenA = artifacts.require("mocks/PairTokenA.sol");
const PairTokenB = artifacts.require("mocks/PairTokenB.sol");
const Signer = require('./signer');

contract('Liquid Miners Pool', function (accounts) {

  // Pool config
  const now = Math.floor(new Date().getTime() / 1000);

  const proofTimeInFirstEpoch = now + 600; // In 6 mins
  const duration = 3;
  const chainId = 1;

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
    this.lmPoolAddress = await this.lmPoolFactory.createDynamicPool.call(
      "gate",
      this.tokenA.address,
      this.tokenB.address,
      this.token.address,
      chainId,
      { from: accounts[0] }
    );
    await this.lmPoolFactory.createDynamicPool(
      "gate",
      this.tokenA.address,
      this.tokenB.address,
      this.token.address,
      chainId,
      { from: accounts[0] }
    );
    
    this.lmPool = await LMPool.at(this.lmPoolAddress);

    // Signer
    await web3.eth.accounts.wallet.create(2);
    this.signerAddress = web3.eth.accounts.wallet['0'].address;
    this.signer = new Signer(web3, web3.eth.accounts.wallet['0'].privateKey);
    
    //Promoter
    this.promoterAddress = accounts[4];

    // Approve
    this.token.approve(
      this.lmPoolFactory.address,
      '10000000000000000000000000000000000',
      { from: accounts[0] }
    );

    await takeSnapshot();
  });

  afterEach(async function () {    
    await restoreSnapshot();
  });

  describe('Gas tests in simple pool', function () {

    it('adding rewards for one year', async function() {
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '100000000000000000000000000', 52, { from: accounts[0], gasLimit: 3000000 });
      assert.isTrue(true, 'We broke');
    });

    it('claim 30 epochs', async function() {
      const epochNumber = 5;
      let epochs = [];
      for (let i = 0; i < epochNumber; i++) {
        epochs.push(i);
      }
      await time.increase(time.duration.days(7 * epochNumber + 1));
      await this.lmPool.multiClaim(epochs, { from: accounts[0], gasLimit: 3000000 });
      assert.isTrue(true, 'We broke');
    });

  });

  describe('Simple pool', function () {

    it('isActive after starttime but not funded with rewards', async function() {
      await time.increase(time.duration.minutes(6));

      assert.isFalse(
        await this.lmPool.isActive(),
        'isActive value is wrong'
      );
    });

    it('isActive after fund rewards and starttime', async function() {
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '100000000000000000000000000', duration, { from: accounts[0], gasLimit: 1000000 });

      await time.increase(time.duration.minutes(6));

      assert.isTrue(
        await this.lmPool.isActive(),
        'isActive value is wrong'
      );
    });

  });

  describe('Simple pool', function () {

    it('should throw error if we already reached claim time', async function() {
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '100000000000000000000000000', duration, { from: accounts[0], gasLimit: 1000000 });

      await time.increase(time.duration.minutes(6));

      assert.isTrue(
        await this.lmPool.isActive(),
        'isActive value is wrong'
      );
      const signature = await this.signer.createSignature(accounts[2], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[2]));


      await time.increase(time.duration.days(8));

      await expectRevert(
        this.lmPool.submitProof(signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
          { from: accounts[2] }
        ),
        'This epoch is already claimable'
      );
    });

    it('should throw error if proof is not from oracle', async function() {
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '100000000000000000000000000', duration, { from: accounts[0], gasLimit: 1000000 });

      await time.increase(time.duration.minutes(6));

      assert.isTrue(
        await this.lmPool.isActive(),
        'isActive value is wrong'
      );
      const signature = await this.signer.createSignature(accounts[2], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[2]));

      await expectRevert(
        this.lmPool.submitProof(signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
          { from: accounts[2] }
        ),
        'Signature is not from an oracle'
      );
    });

    it('should count points', async function() {
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '100000000000000000000000000', duration, { from: accounts[0], gasLimit: 1000000 });

      await time.increase(time.duration.minutes(6));

      assert.isTrue(
        await this.lmPool.isActive(),
        'isActive value is wrong'
      );
      let signature = await this.signer.createSignature(accounts[2], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[2]));

      assert.isFalse(await this.lmPoolFactory.hasRole(await this.lmPoolFactory.ORACLE_NODE.call(), this.signerAddress), 'Oracle is not correct');
      await this.lmPoolFactory.createOracle(this.signerAddress, { from: accounts[0] });
      assert.isTrue(await this.lmPoolFactory.hasRole(await this.lmPoolFactory.ORACLE_NODE.call(), this.signerAddress), 'Oracle is not correct');

      assert.equal(await this.lmPool.userTotalPoints(accounts[2]), '0', 'Incorrect user points');
      assert.equal(await this.lmPool.totalPoints(0), '0', 'Incorrect total points');
      assert.equal(await this.lmPool.totalPoints(1), '0', 'Incorrect total points');

      await this.lmPool.submitProof(signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
        { from: accounts[2], gasLimit: 1000000 }
      );


      assert.equal(await this.lmPool.userTotalPoints(accounts[2]), '5000000000000000000', 'Incorrect user points');
      assert.equal(await this.lmPool.totalPoints(0), '5000000000000000000', 'Incorrect total points');
      assert.equal(await this.lmPool.totalPoints(1), '0', 'Incorrect total points');

      await expectRevert(
        this.lmPool.submitProof(signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
          { from: accounts[2], gasLimit: 1000000 }
        ),
        'Nonce already used'
      );

      signature = await this.signer.createSignature(accounts[3], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[3]));
      await this.lmPool.submitProof(signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
        { from: accounts[3], gasLimit: 1000000 }
      );

      assert.equal(await this.lmPool.userTotalPoints(accounts[2]), '5000000000000000000', 'Incorrect user points');
      assert.equal(await this.lmPool.userTotalPoints(accounts[3]), '5000000000000000000', 'Incorrect user points');
      assert.equal(await this.lmPool.totalPoints(0), '10000000000000000000', 'Incorrect total points');
      assert.equal(await this.lmPool.totalPoints(1), '0', 'Incorrect total points');

      assert.equal(await this.lmPool.getCurrentEpoch(), 0, 'Incorrect epoch');
      assert.equal(await this.lmPool.pendingReward(accounts[2], 0), '0', 'Incorrect pending reward');
      await expectRevert(
        this.lmPool.claim(0, { from: accounts[2], gasLimit: 1000000 }),
        'This epoch is not claimable'
      );
      await time.increase(time.duration.days(8));

      assert.equal(await this.lmPool.getCurrentEpoch(), 1, 'Incorrect epoch');
      assert.equal((await this.lmPool.pendingReward(accounts[2], 0)).toString(), '14833333333333333330000000', 'Incorrect pending reward');

      signature = await this.signer.createSignature(accounts[3], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[3]));
      await expectRevert(
        this.lmPool.submitProof(signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
          { from: accounts[3], gasLimit: 1000000 }
        ),
        'This epoch is already claimable'
      );

      assert.equal(await this.token.balanceOf(accounts[2]), '0', 'Incorrect reward balance');
      await this.lmPool.claim(0, { from: accounts[2], gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(accounts[2])).toString(), '14833333333333333330000000', 'Incorrect reward balance');


      await this.lmPool.claim(0, { from: accounts[2], gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(accounts[2])).toString(), '14833333333333333330000000', 'Incorrect reward balance');

    });

  });

  describe('Rebates rewards', function () {    

    it('Should increase rebates balance', async function() {
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '1000000000000000000000000', duration, { from: accounts[0], gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(this.lmPoolAddress)).toString(), '900000000000000000000000', 'Incorrect pool balance');
      assert.equal((await this.lmPool.promotersTotalRewards()).toString(), '10000000000000000000000', 'Incorrect promoters balance');
      
      await time.increase(time.duration.minutes(6));

      assert.isTrue(
        await this.lmPool.isActive(),
        'isActive value is wrong'
      );
      let signature = await this.signer.createSignature(accounts[2], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[2]));

      assert.isFalse(await this.lmPoolFactory.hasRole(await this.lmPoolFactory.ORACLE_NODE.call(), this.signerAddress), 'Oracle is not correct');
      await this.lmPoolFactory.createOracle(this.signerAddress, { from: accounts[0] });
      assert.isTrue(await this.lmPoolFactory.hasRole(await this.lmPoolFactory.ORACLE_NODE.call(), this.signerAddress), 'Oracle is not correct');

      assert.equal(await this.lmPool.userTotalPoints(accounts[2]), '0', 'Incorrect user points');
      assert.equal(await this.lmPool.totalPoints(0), '0', 'Incorrect total points');
      assert.equal(await this.lmPool.totalPoints(1), '0', 'Incorrect total points');

      await this.lmPool.submitProof(signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
        { from: accounts[2], gasLimit: 1000000 }
      );

      let epoch = await this.lmPool.getEpoch(signature.proofTime);

      assert.equal(await this.lmPool.getPromoterEpochContribution(this.promoterAddress,epoch), signature.finalPoints, 'Incorrect promoter contribution');
    });

    it('One promoter takes 100% of the rewards', async function() {
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '3000000000000000000000000', duration, { from: accounts[0], gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(this.lmPoolAddress)).toString(), '2700000000000000000000000', 'Incorrect pool balance');
      assert.equal((await this.lmPool.promotersTotalRewards()).toString(), '30000000000000000000000', 'Incorrect promoters balance');
      
      await time.increase(time.duration.minutes(6));

      assert.isTrue(
        await this.lmPool.isActive(),
        'isActive value is wrong'
      );
      let signature = await this.signer.createSignature(accounts[2], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[2]));

      assert.isFalse(await this.lmPoolFactory.hasRole(await this.lmPoolFactory.ORACLE_NODE.call(), this.signerAddress), 'Oracle is not correct');
      await this.lmPoolFactory.createOracle(this.signerAddress, { from: accounts[0] });
      assert.isTrue(await this.lmPoolFactory.hasRole(await this.lmPoolFactory.ORACLE_NODE.call(), this.signerAddress), 'Oracle is not correct');

      assert.equal(await this.lmPool.userTotalPoints(accounts[2]), '0', 'Incorrect user points');
      assert.equal(await this.lmPool.totalPoints(0), '0', 'Incorrect total points');
      assert.equal(await this.lmPool.totalPoints(1), '0', 'Incorrect total points');

      await this.lmPool.submitProof(signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
        { from: accounts[2], gasLimit: 1000000 }
      );

      let epoch = await this.lmPool.getEpoch(signature.proofTime);

      assert.equal(await this.lmPool.getPromoterEpochContribution(this.promoterAddress,epoch), signature.finalPoints, 'Incorrect promoter contribution');

      await time.increase(time.duration.days(8));

      assert.equal(await this.token.balanceOf(this.promoterAddress), '0', 'Incorrect promoter balance');      
      await this.lmPool.claimRebateRewards(epoch,{ from: this.promoterAddress, gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(this.promoterAddress)).toString(), '10000000000000000000000', 'Incorrect promoter balance');
    });

    it('Two promoters takes 50% of the rewards each', async function() {
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '3000000000000000000000000', duration, { from: accounts[0], gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(this.lmPoolAddress)).toString(), '2700000000000000000000000', 'Incorrect pool balance');
      assert.equal((await this.lmPool.promotersTotalRewards()).toString(), '30000000000000000000000', 'Incorrect promoters balance');
      
      await time.increase(time.duration.minutes(6));

      assert.isTrue(
        await this.lmPool.isActive(),
        'isActive value is wrong'
      );
      let signature = await this.signer.createSignature(accounts[2], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[2]));

      assert.isFalse(await this.lmPoolFactory.hasRole(await this.lmPoolFactory.ORACLE_NODE.call(), this.signerAddress), 'Oracle is not correct');
      await this.lmPoolFactory.createOracle(this.signerAddress, { from: accounts[0] });
      assert.isTrue(await this.lmPoolFactory.hasRole(await this.lmPoolFactory.ORACLE_NODE.call(), this.signerAddress), 'Oracle is not correct');

      assert.equal(await this.lmPool.userTotalPoints(accounts[2]), '0', 'Incorrect user points');
      assert.equal(await this.lmPool.totalPoints(0), '0', 'Incorrect total points');
      assert.equal(await this.lmPool.totalPoints(1), '0', 'Incorrect total points');

      await this.lmPool.submitProof(signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
        { from: accounts[2], gasLimit: 1000000 }
      );      

      signature = await this.signer.createSignature(accounts[3], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[3]));
      await this.lmPool.submitProof(signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,accounts[5],
        { from: accounts[3], gasLimit: 1000000 }
      );

      let epoch = await this.lmPool.getEpoch(signature.proofTime);      

      assert.equal((await this.lmPool.getPromoterEpochContribution(this.promoterAddress,epoch)).toString(), '5000000000000000000', 'Incorrect promoter contribution');
      assert.equal((await this.lmPool.getPromoterEpochContribution(accounts[5],epoch)).toString(), '5000000000000000000', 'Incorrect promoter contribution');
      assert.equal((await this.lmPool.getPromotersEpochTotalContribution(epoch)).toString(),'10000000000000000000','Incorrect promoters epoch total contribution');

      await time.increase(time.duration.days(8));

      assert.equal(await this.token.balanceOf(this.promoterAddress), '0', 'Incorrect promoter balance');
      await this.lmPool.claimRebateRewards(epoch,{ from: this.promoterAddress, gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(this.promoterAddress)).toString(), '5000000000000000000000', 'Incorrect promoter balance');
      
      assert.equal(await this.token.balanceOf(accounts[5]), '0', 'Incorrect promoter balance');
      await this.lmPool.claimRebateRewards(epoch,{ from: accounts[5], gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(accounts[5])).toString(), '5000000000000000000000', 'Incorrect promoter balance');
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
