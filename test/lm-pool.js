const { expectRevert, expectEvent, BN, time, ether, balance } = require('@openzeppelin/test-helpers');
const { inTransaction } = require('@openzeppelin/test-helpers/src/expectEvent');
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
      0,
      { from: accounts[0] }
    );
    await this.lmPoolFactory.createDynamicPool(
      "gate",
      this.tokenA.address,
      this.tokenB.address,
      this.token.address,
      chainId,
      0,
      { from: accounts[0] }
    );
    
    this.lmPool = await LMPool.at(this.lmPoolAddress);

    // Signer
    await web3.eth.accounts.wallet.create(2);
    this.signerAddress = web3.eth.accounts.wallet['0'].address;
    this.signer = new Signer(web3, web3.eth.accounts.wallet['0'].privateKey);
    await web3.eth.sendTransaction({to: this.signerAddress, from:accounts[0], value: web3.utils.toWei('1')})
    /** Bind the new wallet to the personal accounts */
    await web3.eth.personal.importRawKey(web3.eth.accounts.wallet['0'].privateKey, '') // password is empty
    await web3.eth.personal.unlockAccount(web3.eth.accounts.wallet['0'].address, '', 10000) // arbitrary duration
    
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
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '100000000000000000000000000', 40, { from: accounts[0], gasLimit: 3000000 });
      assert.isTrue(true, 'We broke');
    });

    it("Should return epoch 0 for timestamp prior to startDate",async function(){
      let startDate = await this.lmPool.startDate();

      assert.equal(await this.lmPool.getEpoch(startDate - 1),0,"Wrong epoch");
    });

    it('multi claim 3 epochs', async function() {
      await this.lmPoolFactory.createOracle(this.signerAddress, { from: accounts[0] });
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '100000000000000000000000000', 3, { from: accounts[0], gasLimit: 1000000 });
      assert.equal(await this.lmPool.totalRewards(), '89000000000000000000000000', 'Incorrect total rewards')
      const epochNumber = 3;
      let epochs = [];
      for (let i = 1; i < epochNumber + 1; i++) {
        epochs.push(i);
        const {0: start} = await this.lmPool.getProofTimeInverval(i, this.signerAddress);
        assert.equal(await this.lmPool.getCurrentEpoch(), i, 'Incorrect epoch');
        let signature = await this.signer.createSignature(accounts[2], 5, parseInt(start.toString()) + 1000, this.lmPoolAddress,web3.utils.keccak256(accounts[2]));
        await this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof, signature.uidHash,this.promoterAddress,
          { from: accounts[2], gasLimit: 1000000 }
        );
        await time.increase(time.duration.hours(24 * 7 + 1)); // 7 days + 1 hour
      }
      let user0 = await this.lmPool.userInfo(accounts[2], 0);
      let user1 = await this.lmPool.userInfo(accounts[2], 1);
      let user2 = await this.lmPool.userInfo(accounts[2], 2);
      let user3 = await this.lmPool.userInfo(accounts[2], 3);
      let user4 = await this.lmPool.userInfo(accounts[2], 4);
      assert.equal(user0.amount, '0', 'Incorrect amount');
      assert.equal(user1.amount, '5000000000000000000', 'Incorrect amount');
      assert.equal(user2.amount, '5000000000000000000', 'Incorrect amount');
      assert.equal(user3.amount, '5000000000000000000', 'Incorrect amount');
      assert.equal(user4.amount, '0', 'Incorrect amount');
      assert.equal(user0.rewardDebt, '0', 'Incorrect debt');
      assert.equal(user1.rewardDebt, '0', 'Incorrect debt');
      assert.equal(user2.rewardDebt, '0', 'Incorrect debt');
      assert.equal(user3.rewardDebt, '0', 'Incorrect debt');
      assert.equal(user4.rewardDebt, '0', 'Incorrect debt');
      await time.increase(time.duration.hours(24 * 7 + 1)); // 7 days + 1 hour

      assert.equal(await this.token.balanceOf(accounts[2]), '0', 'Incorrect reward balance');

      await this.lmPool.multiClaim(epochs, { from: accounts[2], gasLimit: 3000000 });
      user0 = await this.lmPool.userInfo(accounts[2], 0);
      user1 = await this.lmPool.userInfo(accounts[2], 1);
      user2 = await this.lmPool.userInfo(accounts[2], 2);
      user3 = await this.lmPool.userInfo(accounts[2], 3);
      user4 = await this.lmPool.userInfo(accounts[2], 4);
      assert.equal(user0.amount, '0', 'Incorrect amount');
      assert.equal(user1.amount, '5000000000000000000', 'Incorrect amount');
      assert.equal(user2.amount, '5000000000000000000', 'Incorrect amount');
      assert.equal(user3.amount, '5000000000000000000', 'Incorrect amount');
      assert.equal(user4.amount, '0', 'Incorrect amount');
      assert.equal(user0.rewardDebt, '0', 'Incorrect debt');
      assert.equal(user1.rewardDebt, '29666666666666666665000000', 'Incorrect debt');
      assert.equal(user2.rewardDebt, '29666666666666666665000000', 'Incorrect debt');
      assert.equal(user3.rewardDebt, '29666666666666666665000000', 'Incorrect debt');
      assert.equal(user4.rewardDebt, '0', 'Incorrect debt');
      assert.isTrue(true, 'We broke');
    });

    it("Can't claim more than 100 epochs at a time", async function(){
      let epochs = [];
      for (let i = 1; i <= 101; i++) {
        epochs.push(i);        
      }
      await expectRevert(this.lmPool.multiClaim(epochs),"LMPool: epochs amount must be less or equal than 100");
    });
    
    it("Can't claim oracle rewards for more than 100 epochs at a time", async function(){
      let epochs = [];
      for (let i = 1; i <= 101; i++) {
        epochs.push(i);        
      }
      await expectRevert(this.lmPool.multiClaimOracleRewards(epochs),"LMPool: epochs amount must be less or equal than 100");
    });
    
    it("Can't claim rebates rewards more than 100 epochs at a time", async function(){
      let epochs = [];
      for (let i = 1; i <= 101; i++) {
        epochs.push(i);        
      }
      await expectRevert(this.lmPool.multiClaimRebateRewards(epochs),"LMPool: epochs amount must be less or equal than 100");
    });

    it("Test getProofTimeInterval",async function(){
      let startDate = (await this.lmPool.startDate());
      let epochDuration = 604800; //7 days
      let epoch = 3;
      let epochEnd = startDate.toNumber() + (epochDuration * epoch);
      
      let epochStart = epochEnd.toString() - epochDuration.toString();
      
      let {start, end} = await this.lmPool.getProofTimeInverval(epoch,accounts[0]);      

      assert.equal(start.toString(),epochStart.toString(),"Wrong epochStart")
      assert.equal(end.toString(),startDate.toString(),"Wrong epochEnd")

    });

    it('Test getProofTimeInterval after proof submission', async function() {
      let startDate = (await this.lmPool.startDate());      
      let epoch = 3;
      
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '100000000000000000000000000', duration, { from: accounts[0], gasLimit: 1000000 });

      await time.increase(time.duration.minutes(6));

      await this.lmPoolFactory.createOracle(this.signerAddress, { from: accounts[0] });
      let signature = await this.signer.createSignature(accounts[0], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[0]));

      await this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
        { from: accounts[0], gasLimit: 1000000 }
      );

      let {start, end} = await this.lmPool.getProofTimeInverval(epoch,accounts[0]);      

      assert.equal(start.toString(),epochStart.toString(),"Wrong epochStart")
      assert.equal(end.toString(),startDate.toString(),"Wrong epochEnd")
      
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

    it('should add rewards correctly', async function() {
      assert.equal(await this.lmPool.getCurrentEpoch(), 1, 'Incorrect epoch');
      assert.equal(await this.lmPool.getRewardsPerEpoch(1), '0', 'Incorrect rewards');
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '2000000000000000000000', 2, { from: accounts[0], gasLimit: 1000000 });
      assert.equal(await this.lmPool.getRewardsPerEpoch(1), '890000000000000000000', 'Incorrect rewards');
      assert.equal(await this.lmPool.getRewardsPerEpoch(2), '890000000000000000000', 'Incorrect rewards');
      assert.equal(await this.lmPool.getRewardsPerEpoch(3), '0', 'Incorrect rewards');
      await time.increase(time.duration.days(15));
      assert.equal(await this.lmPool.getCurrentEpoch(), 3, 'Incorrect epoch');
      assert.equal(await this.lmPool.getRewardsPerEpoch(3), '0', 'Incorrect rewards');
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '2000000000000000000000', 2, { from: accounts[0], gasLimit: 1000000 });
      assert.equal(await this.lmPool.getRewardsPerEpoch(3), '890000000000000000000', 'Incorrect rewards');
      assert.equal(await this.lmPool.getRewardsPerEpoch(4), '890000000000000000000', 'Incorrect rewards');
      assert.equal(await this.lmPool.getRewardsPerEpoch(5), '0', 'Incorrect rewards');

      assert.isTrue(
        await this.lmPool.isActive(),
        'isActive value is wrong'
      );
    });

    it("Shouldn't add rewards as not factory",async function(){
      await expectRevert(this.lmPool.addRewards(20,15,15, 2, { from: accounts[0]}),
      "Only factory can add internal rewards");
    });

    it("Shouldn't add rewards for more than 41 epochs",async function(){
      await expectRevert(this.lmPoolFactory.addRewards(
        this.lmPoolAddress, '2000000000000000000000', 42, { from: accounts[0], gasLimit: 1000000 }),
        "Can't send more than 41 epochs at the same time")
    });

    it("Shouldn't add rewards for 0 epochs",async function(){
      await expectRevert(this.lmPoolFactory.addRewards(
        this.lmPoolAddress, '2000000000000000000000', 0, { from: accounts[0], gasLimit: 1000000 }),
        "Can't divide by 0 epochs")
    });

  });

  describe('Simple pool', function () {

    it("Shouldn't submit proof if pool is not active", async function() {      
      await time.increase(time.duration.minutes(6));
      
      let signature = await this.signer.createSignature(accounts[2], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[2]));
      
      await this.lmPoolFactory.createOracle(this.signerAddress, { from: accounts[0] });

      await expectRevert(this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
        { from: accounts[2], gasLimit: 1000000 }
      ),"LMPool: Pool has not started");
    });

    it("Shouldn't submit proof for inexistent pool", async function() {      
      await time.increase(time.duration.minutes(6));
      
      let signature = await this.signer.createSignature(accounts[2], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[2]));
      
      await this.lmPoolFactory.createOracle(this.signerAddress, { from: accounts[0] });

      await expectRevert(this.lmPoolFactory.submitProof(accounts[0], signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
        { from: accounts[2], gasLimit: 1000000 }
      ),"Pool not found");
    });

    it("Shouldn't submit proof zero address promoter", async function() {      
      await time.increase(time.duration.minutes(6));
      
      let signature = await this.signer.createSignature(accounts[2], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[2]));
      
      await this.lmPoolFactory.createOracle(this.signerAddress, { from: accounts[0] });

      await expectRevert(this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,"0x0000000000000000000000000000000000000000",
        { from: accounts[2], gasLimit: 1000000 }
      ),"Promoter can't be the zero address");
    });

    it('should throw error if we already reached claim time', async function() {
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '100000000000000000000000000', duration, { from: accounts[0], gasLimit: 1000000 });

      await time.increase(time.duration.minutes(6));

      assert.isTrue(
        await this.lmPool.isActive(),
        'isActive value is wrong'
      );
      await this.lmPoolFactory.createOracle(this.signerAddress, { from: accounts[0] });
      const signature = await this.signer.createSignature(accounts[2], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[2]));


      await time.increase(time.duration.days(8));

      await expectRevert(
        this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
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
        this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
          { from: accounts[2] }
        ),
        'Signature is not from a valid oracle'
      );
    });

    it('should throw error if proof is not from factory', async function() {
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '100000000000000000000000000', duration, { from: accounts[0], gasLimit: 1000000 });

      await time.increase(time.duration.minutes(6));

      assert.isTrue(
        await this.lmPool.isActive(),
        'isActive value is wrong'
      );
      const signature = await this.signer.createSignature(accounts[2], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[2]));

      await expectRevert(
        this.lmPool.submitProof(accounts[0], signature.finalPoints, signature.nonce,
          signature.proofTime, signature.uidHash,this.promoterAddress,this.promoterAddress),
        'Only factory can add proofs'
      );
    });

    it("Shouldn't submit proof with amount = 0",async function(){
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '100000000000000000000000000', duration, { from: accounts[0], gasLimit: 1000000 });

      await time.increase(time.duration.minutes(6));

      let signature = await this.signer.createSignature(accounts[2], 0, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[2]));
      await this.lmPoolFactory.createOracle(this.signerAddress, { from: accounts[0] });

      await expectRevert(this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
        { from: accounts[2], gasLimit: 1000000 }
      ),"Amount must be more than 0");
    })

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
      assert.equal(await this.lmPool.totalPoints(1), '0', 'Incorrect total points');
      assert.equal(await this.lmPool.totalPoints(2), '0', 'Incorrect total points');

      await this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
        { from: accounts[2], gasLimit: 1000000 }
      );


      assert.equal(await this.lmPool.userTotalPoints(accounts[2]), '5000000000000000000', 'Incorrect user points');
      assert.equal(await this.lmPool.totalPoints(1), '5000000000000000000', 'Incorrect total points');
      assert.equal(await this.lmPool.totalPoints(2), '0', 'Incorrect total points');

      await expectRevert(
        this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
          { from: accounts[2], gasLimit: 1000000 }
        ),
        'Nonce already used'
      );

      signature = await this.signer.createSignature(accounts[3], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[3]));
      await this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
        { from: accounts[3], gasLimit: 1000000 }
      );

      assert.equal(await this.lmPool.userTotalPoints(accounts[2]), '5000000000000000000', 'Incorrect user points');
      assert.equal(await this.lmPool.userTotalPoints(accounts[3]), '5000000000000000000', 'Incorrect user points');
      assert.equal(await this.lmPool.totalPoints(1), '10000000000000000000', 'Incorrect total points');
      assert.equal(await this.lmPool.totalPoints(2), '0', 'Incorrect total points');

      assert.equal(await this.lmPool.getCurrentEpoch(), 1, 'Incorrect epoch');
      assert.equal(await this.lmPool.pendingReward(accounts[2], 1), '0', 'Incorrect pending reward');
      await expectRevert(
        this.lmPool.claim(1, { from: accounts[2], gasLimit: 1000000 }),
        'This epoch is not claimable'
      );
      await expectRevert(
        this.lmPool.claimRebateRewards(1, { from: accounts[2], gasLimit: 1000000 }),
        'This epoch is not claimable'
      );
      await expectRevert(
        this.lmPool.claimOracleRewards(1, { from: accounts[2], gasLimit: 1000000 }),
        'This epoch is not claimable'
      );
      await time.increase(time.duration.days(8));

      assert.equal(await this.lmPool.getCurrentEpoch(), 2, 'Incorrect epoch');
      assert.equal((await this.lmPool.pendingReward(accounts[2], 1)).toString(), '14833333333333333330000000', 'Incorrect pending reward');

      signature = await this.signer.createSignature(accounts[3], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[3]));
      await expectRevert(
        this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
          { from: accounts[3], gasLimit: 1000000 }
        ),
        'This epoch is already claimable'
      );

      assert.equal(await this.token.balanceOf(accounts[2]), '0', 'Incorrect reward balance');
      await this.lmPool.claim(1, { from: accounts[2], gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(accounts[2])).toString(), '14833333333333333330000000', 'Incorrect reward balance');


      await expectRevert(
        this.lmPool.claim(1, { from: accounts[2], gasLimit: 1000000 }),
        'There is nothing to claim for this epoch'
      );
    });

    it('should count points in multiple submits', async function () {
      await this.lmPoolFactory.createOracle(this.signerAddress, { from: accounts[0] });
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '100000000000000000000000000', 3, { from: accounts[0], gasLimit: 1000000 });
      assert.equal(await this.lmPool.totalRewards(), '89000000000000000000000000', 'Incorrect total rewards')
      const {0: start} = await this.lmPool.getProofTimeInverval(1, this.signerAddress);
      let signature = await this.signer.createSignature(accounts[2], 5, parseInt(start.toString()) + 1000, this.lmPoolAddress,web3.utils.keccak256(accounts[2]));
      assert.equal(await this.token.balanceOf(accounts[2]), '0', 'Incorrect promoter balance');
      let user = await this.lmPool.userInfo(accounts[2], 1);
      assert.equal(user.amount, '0', 'Incorrect amount');
      assert.equal(user.rewardDebt, '0', 'Incorrect debt');

      await this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof, signature.uidHash,this.promoterAddress,
        { from: accounts[2], gasLimit: 1000000 }
      );
      user = await this.lmPool.userInfo(accounts[2], 1);
      assert.equal(user.amount, '5000000000000000000', 'Incorrect amount');
      assert.equal(user.rewardDebt, '0', 'Incorrect debt');

      assert.equal(await this.token.balanceOf(accounts[2]), '0', 'Incorrect balance');
      signature = await this.signer.createSignature(accounts[2], 5, parseInt(start.toString()) + 1000, this.lmPoolAddress,web3.utils.keccak256(accounts[2]));
      await this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof, signature.uidHash,this.promoterAddress,
        { from: accounts[2], gasLimit: 1000000 }
      );
      user = await this.lmPool.userInfo(accounts[2], 1);
      assert.equal(user.amount, '10000000000000000000', 'Incorrect amount');
      assert.equal(user.rewardDebt, '0', 'Incorrect debt');
      
      assert.equal(await this.token.balanceOf(accounts[2]), '0', 'Incorrect balance');
    })

    it("Sholuld get 0 pending rewards",async function(){
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '1000000000000000000000000', duration, { from: accounts[0], gasLimit: 1000000 });
            
      await time.increase(time.duration.minutes(6));

      assert.equal(await this.lmPool.pendingReward(accounts[2],4),0,"Incorrect pending rewards");

    });

  });

  describe('Rebates rewards', function () {    

    it('Should increase rebates balance', async function() {
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '1000000000000000000000000', duration, { from: accounts[0], gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(this.lmPoolAddress)).toString(), '910000000000000000000000', 'Incorrect pool balance');
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

      await this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
        { from: accounts[2], gasLimit: 1000000 }
      );

      let epoch = await this.lmPool.getEpoch(signature.proofTime);

      assert.equal(await this.lmPool.getPromoterEpochContribution(this.promoterAddress,epoch), signature.finalPoints, 'Incorrect promoter contribution');
    });

    it('One promoter takes 100% of the rewards', async function() {
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '3000000000000000000000000', duration, { from: accounts[0], gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(this.lmPoolAddress)).toString(), '2730000000000000000000000', 'Incorrect pool balance');
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

      await this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
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
      assert.equal((await this.token.balanceOf(this.lmPoolAddress)).toString(), '2730000000000000000000000', 'Incorrect pool balance');
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

      await this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
        { from: accounts[2], gasLimit: 1000000 }
      );      

      signature = await this.signer.createSignature(accounts[3], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[3]));
      await this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,accounts[5],
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
      await expectRevert(
        this.lmPool.claimRebateRewards(epoch,{ from: this.promoterAddress, gasLimit: 1000000 }),
        'No rewards to claim in the given epoch'
      );
      assert.equal((await this.token.balanceOf(this.promoterAddress)).toString(), '5000000000000000000000', 'Incorrect promoter balance');

      assert.equal(await this.token.balanceOf(accounts[5]), '0', 'Incorrect promoter balance');
      await this.lmPool.claimRebateRewards(epoch,{ from: accounts[5], gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(accounts[5])).toString(), '5000000000000000000000', 'Incorrect promoter balance');
    });    
  });

  describe('Oracle rewards', function () {    

    it('Should increase oracle balance', async function() {
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '1000000000000000000000000', duration, { from: accounts[0], gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(this.lmPoolAddress)).toString(), '910000000000000000000000', 'Incorrect pool balance');
      assert.equal((await this.lmPool.oraclesTotalRewards()).toString(), '10000000000000000000000', 'Incorrect promoters balance');
      
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

      await this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
        { from: accounts[2], gasLimit: 1000000 }
      );

      let epoch = await this.lmPool.getEpoch(signature.proofTime);

      assert.equal(await this.lmPool.getOracleEpochContribution(this.signerAddress, epoch), signature.finalPoints, 'Incorrect promoter contribution');
    });

    it('One oracle takes 100% of the rewards', async function() {
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '3000000000000000000000000', duration, { from: accounts[0], gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(this.lmPoolAddress)).toString(), '2730000000000000000000000', 'Incorrect pool balance');
      assert.equal((await this.lmPool.oraclesTotalRewards()).toString(), '30000000000000000000000', 'Incorrect promoters balance');
      
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

      await this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
        { from: accounts[2], gasLimit: 1000000 }
      );

      let epoch = await this.lmPool.getEpoch(signature.proofTime);

      assert.equal(await this.lmPool.getOracleEpochContribution(this.signerAddress, epoch), signature.finalPoints, 'Incorrect promoter contribution');

      await time.increase(time.duration.days(8));

      assert.equal(await this.token.balanceOf(this.signerAddress), '0', 'Incorrect promoter balance');      
      await this.lmPool.claimOracleRewards(epoch,{ from: this.signerAddress, gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(this.signerAddress)).toString(), '10000000000000000000000', 'Incorrect promoter balance');
    });

    it('Two oracles takes 50% of the rewards each', async function() {
      await this.lmPoolFactory.addRewards(this.lmPoolAddress, '3000000000000000000000000', duration, { from: accounts[0], gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(this.lmPoolAddress)).toString(), '2730000000000000000000000', 'Incorrect pool balance');
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

      await this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,this.promoterAddress,
        { from: accounts[2], gasLimit: 1000000 }
      );      
      

      const signerAddress2 = web3.eth.accounts.wallet['3'].address;
      const signer2 = new Signer(web3, web3.eth.accounts.wallet['3'].privateKey);

      await web3.eth.sendTransaction({to: signerAddress2, from:accounts[0], value: web3.utils.toWei('1')})
      /** Bind the new wallet to the personal accounts */
      await web3.eth.personal.importRawKey(web3.eth.accounts.wallet['3'].privateKey, '') // password is empty
      await web3.eth.personal.unlockAccount(web3.eth.accounts.wallet['3'].address, '', 10000) // arbitrary duration

      await this.lmPoolFactory.createOracle(signerAddress2, { from: accounts[0] });

      signature = await signer2.createSignature(accounts[3], 5, proofTimeInFirstEpoch, this.lmPoolAddress,web3.utils.keccak256(accounts[3]));
      await this.lmPoolFactory.submitProof(this.lmPoolAddress, signature.finalPoints, signature.nonce, signature.proofTime, signature.proof,signature.uidHash,accounts[5],
        { from: accounts[3], gasLimit: 1000000 }
      );

      let epoch = await this.lmPool.getEpoch(signature.proofTime);      

      assert.equal((await this.lmPool.getOracleEpochContribution(this.signerAddress, epoch)).toString(), '5000000000000000000', 'Incorrect signer contribution');
      assert.equal((await this.lmPool.getOracleEpochContribution(signerAddress2, epoch)).toString(), '5000000000000000000', 'Incorrect signer contribution');
      assert.equal((await this.lmPool.getOraclesEpochTotalContribution(epoch)).toString(),'10000000000000000000','Incorrect signers epoch total contribution');

      await time.increase(time.duration.days(8));

      assert.equal(await this.token.balanceOf(this.signerAddress), '0', 'Incorrect signer balance');
      await this.lmPool.claimOracleRewards(epoch,{ from: this.signerAddress, gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(this.signerAddress)).toString(), '5000000000000000000000', 'Incorrect signer balance');
      await expectRevert(
        this.lmPool.claimOracleRewards(epoch,{ from: this.signerAddress, gasLimit: 1000000 }),
        'No rewards to claim in the given epoch'
      );
      assert.equal((await this.token.balanceOf(this.signerAddress)).toString(), '5000000000000000000000', 'Incorrect signer balance');

      assert.equal(await this.token.balanceOf(signerAddress2), '0', 'Incorrect signer balance');
      await this.lmPool.claimOracleRewards(epoch,{ from: signerAddress2, gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(signerAddress2)).toString(), '5000000000000000000000', 'Incorrect signer balance');
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
