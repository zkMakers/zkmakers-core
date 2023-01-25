const { expectRevert, expectEvent, BN, time, ether, balance } = require('@openzeppelin/test-helpers');
const { inTransaction } = require('@openzeppelin/test-helpers/src/expectEvent');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const { expect, assert } = require('chai');

const ProofVerifier = artifacts.require("ProofVerifier");
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
      0,
      { from: accounts[0] }
    );
    const { logs } = await this.lmPoolFactory.createDynamicPool(
      "gate",
      this.tokenA.address,
      this.tokenB.address,
      this.token.address,
      chainId,
      0,
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

    it('Initial values', async function() {
      assert.equal(await this.lmPoolFactory.getFee(), 900, "Fees are not correctly setted");
      assert.equal(await this.lmPoolFactory.maxFee(), 2700, "Max fees are not correctly setted");
      assert.equal(await this.lmPoolFactory.getPromotersFee(), 100, "Promoters fees are not correctly setted");
      assert.equal(await this.lmPoolFactory.maxPromotersFee(), 300, "Max promoters fees are not correctly setted");
      assert.equal(await this.lmPoolFactory.getOracleFee(), 100, "Oracle fees are not correctly setted");
      assert.equal(await this.lmPoolFactory.maxOracleFee(), 300, "Max oracle fees are not correctly setted");
      assert.equal(await this.lmPoolFactory.getCustomTokenFee(), 1900, "Custom token fees are not correctly setted");
      assert.equal(await this.lmPoolFactory.maxCustomTokenFee(), 4000, "Max custom token fees are not correctly setted");      
    });
  });

  describe('Admin functions', function() {
    it('Should add/remove roles as admin', async function(){
      await this.lmPoolFactory.addOwner(accounts[1],{from: accounts[0]});
      assert.equal(await this.lmPoolFactory.hasRole(web3.utils.keccak256("OWNER_ADMIN"),accounts[1]),true,"Owner role not granted");
      
      await this.lmPoolFactory.removeOwner(accounts[1],{from: accounts[0]});
      assert.equal(await this.lmPoolFactory.hasRole(web3.utils.keccak256("OWNER_ADMIN"),accounts[1]),false,"Owner role not revoked");
      
      await this.lmPoolFactory.createOracle(accounts[1],{from: accounts[0]});
      assert.equal(await this.lmPoolFactory.hasRole(web3.utils.keccak256("ORACLE_NODE"),accounts[1]),true,"Oracle node role not granted");
      
      await this.lmPoolFactory.removeOracle(accounts[1],{from: accounts[0]});
      assert.equal(await this.lmPoolFactory.hasRole(web3.utils.keccak256("ORACLE_NODE"),accounts[1]),false,"Oracle node role not revoked");

    });

    it("Shouldn't add/remove roles as not admin", async function(){
      await expectRevert(this.lmPoolFactory.addOwner(accounts[1],{from: accounts[1]}),
        "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
      assert.equal(await this.lmPoolFactory.hasRole(web3.utils.keccak256("OWNER_ADMIN"),accounts[1]),false,"Owner role granted");
      
      await this.lmPoolFactory.addOwner(accounts[1],{from: accounts[0]});
      await expectRevert(this.lmPoolFactory.removeOwner(accounts[1],{from: accounts[2]}),
        "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
      assert.equal(await this.lmPoolFactory.hasRole(web3.utils.keccak256("OWNER_ADMIN"),accounts[1]),true,"Owner role revoked");
      
      await expectRevert(this.lmPoolFactory.createOracle(accounts[1],{from: accounts[2]}),
        "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
      assert.equal(await this.lmPoolFactory.hasRole(web3.utils.keccak256("ORACLE_NODE"),accounts[1]),false,"Oracle node role granted");
      
      await this.lmPoolFactory.createOracle(accounts[1],{from: accounts[0]});
      await expectRevert(this.lmPoolFactory.removeOracle(accounts[1],{from: accounts[2]}),
        "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
      assert.equal(await this.lmPoolFactory.hasRole(web3.utils.keccak256("ORACLE_NODE"),accounts[1]),true,"Oracle node role revoked");

    });

    it('Should add/reject token as admin',async function() {
      let newToken = await Token.new();
      let log = await this.lmPoolFactory.acceptRewardToken(newToken.address,{from: accounts[0]});
      expectEvent(log,"RewardTokenStatus",{
        token: newToken.address,
        accepted: true
      });

      log = await this.lmPoolFactory.rejectRewardToken(newToken.address,{from: accounts[0]});
      expectEvent(log,"RewardTokenStatus",{
        token: newToken.address,
        accepted: false
      });
    })

    it("Shouldn't add/reject reward token as not admin", async function(){
      let newToken = await Token.new();
      await expectRevert(this.lmPoolFactory.acceptRewardToken(newToken.address,{from: accounts[1]}),
        "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");

      await this.lmPoolFactory.acceptRewardToken(newToken.address,{from: accounts[0]});
      await expectRevert(this.lmPoolFactory.rejectRewardToken(newToken.address,{from: accounts[1]}),
        "LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
    });

    it("Sholud set fees as admin", async function(){
      let receipt = await this.lmPoolFactory.setFee(1500,{from:accounts[0]});
      expectEvent(receipt,"FeeSetted",{
        fee: "1500",
        feeType: "Pool fee"
      });

      await expectRevert(this.lmPoolFactory.setFee(2701,{from:accounts[0]}),"LMPoolFactory: fee exceeds max permitted");
      
      receipt = await this.lmPoolFactory.setPromotersFee(300,{from:accounts[0]});
      expectEvent(receipt,"FeeSetted",{
        fee: "300",
        feeType: "Promoter fee"
      });

      await expectRevert(this.lmPoolFactory.setPromotersFee(301,{from:accounts[0]}),"LMPoolFactory: promoters fee exceeds max permitted");
      
      receipt = await this.lmPoolFactory.setOracleFee(250,{from:accounts[0]});
      expectEvent(receipt,"FeeSetted",{
        fee: "250",
        feeType: "Oracle fee"
      });

      await expectRevert(this.lmPoolFactory.setOracleFee(301,{from:accounts[0]}),"LMPoolFactory: oracle fee exceeds max permitted");
      
      receipt = await this.lmPoolFactory.setCustomTokenFee(3999,{from:accounts[0]});
      expectEvent(receipt,"FeeSetted",{
        fee: "3999",
        feeType: "Custom token fee"
      });

      await expectRevert(this.lmPoolFactory.setCustomTokenFee(4001,{from:accounts[0]}),"LMPoolFactory: custom token fee exceeds max permitted");

    });
    
    it("Sholudn't set fees as not admin", async function(){
      await expectRevert(this.lmPoolFactory.setFee(100,{from:accounts[1]}),"LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
      await expectRevert(this.lmPoolFactory.setPromotersFee(100,{from:accounts[1]}),"LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
      await expectRevert(this.lmPoolFactory.setOracleFee(100,{from:accounts[1]}),"LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
      await expectRevert(this.lmPoolFactory.setCustomTokenFee(100,{from:accounts[1]}),"LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");
    });

    it("Should add/remove blockchain as admin",async function(){
      let receipt = await this.lmPoolFactory.addBlockchain(1,{from:accounts[0]});
      
      expectEvent(receipt,"BlockchainStatus",{
        chainId: "1",
        added: true
      })

      receipt = await this.lmPoolFactory.removeBlockchain(1,{from:accounts[0]});
      
      expectEvent(receipt,"BlockchainStatus",{
        chainId: "1",
        added: false
      })

    });
    
    it("Shouldn't add/remove blockchain as not admin",async function(){

      await expectRevert(this.lmPoolFactory.addBlockchain(1,{from:accounts[1]}),"LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");

      await this.lmPoolFactory.addBlockchain(1,{from:accounts[0]});
      await expectRevert(this.lmPoolFactory.removeBlockchain(1,{from:accounts[1]}),"LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");

    });

    it("Should add/remove exchange as admin",async function(){
      let receipt = await this.lmPoolFactory.addExchange("Test",{from:accounts[0]});
      
      expectEvent(receipt,"ExchangeStatus",{
        exchange: "Test",
        added: true
      });

      let receipt2 = await this.lmPoolFactory.removeExchange("Test",{from:accounts[0]});
      
      expectEvent(receipt2,"ExchangeStatus",{
        exchange: "Test",
        added: false
      });

    });
    
    it("Shouldn't add/remove exchange as not admin",async function(){

      await expectRevert(this.lmPoolFactory.addExchange("Test",{from:accounts[1]}),"LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");

      await this.lmPoolFactory.addExchange("Test",{from:accounts[0]});
      await expectRevert(this.lmPoolFactory.removeExchange("Test",{from:accounts[1]}),"LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");

    });

    it("Should set new proof verifier as admin",async function(){      
      
      let receipt = await this.lmPoolFactory.setProofVerifier(this.lmPoolFactory.address,{from:accounts[0]});
      
      expectEvent(receipt,"ProofVerifierSetted",{
        proofVerifier: this.lmPoolFactory.address        
      });
    });
    
    it("Shouldn't set new proof verifier as not admin",async function(){

      await expectRevert(this.lmPoolFactory.setProofVerifier(this.lmPoolFactory.address,{from:accounts[1]}),"LMPoolFactory: Restricted to OWNER_ADMIN role on LMPool");      

    });
  });

  describe('Create dynamic pool', function(){
    it('Should create dynamic pool and add rewards',async function(){
      await this.lmPoolFactory.createDynamicPoolAndAddRewards(
        "gate", this.tokenA.address, this.tokenB.address,this.token.address,chainId,10000,10,1);
    });

    it("Shouln't create pool in a not accepted exchange",async function(){
      await expectRevert(this.lmPoolFactory.createDynamicPool(
        "otherExchange",
        this.tokenA.address,
        this.tokenB.address,
        this.token.address,
        chainId,
        0,
        { from: accounts[0] }
      ),
      "LMPoolFactory: Exchange is not accepted.")
    })

    it("Shouln't create pool in a not accepted blockchain",async function(){
      await expectRevert(this.lmPoolFactory.createDynamicPool(
        "gate",
        this.tokenA.address,
        this.tokenB.address,
        this.token.address,
        130,
        0,
        { from: accounts[0] }
      ),
      "LMPoolFactory: Blockchain is not accepted.")
    })

    it("Shouln't create same pool twice",async function(){
      await expectRevert(this.lmPoolFactory.createDynamicPool(
        "gate",
        this.tokenA.address,
        this.tokenB.address,
        this.token.address,
        chainId,
        0,
        { from: accounts[0] }
      ),
      "LMPoolFactory: Pool already exists.")
    })

    it("Shouln't create same pool twice changing the tokens order",async function(){
      await expectRevert(this.lmPoolFactory.createDynamicPool(
        "gate",
        this.tokenB.address,
        this.tokenA.address,
        this.token.address,
        chainId,
        0,
        { from: accounts[0] }
      ),
      "LMPoolFactory: Pool already exists.")
    })

    it("Shouln't create pool with reward token not accepted",async function(){
      let newRewardToken = await Token.new();

      this.lmPoolFactory.addBlockchain(15);

      await expectRevert(this.lmPoolFactory.createDynamicPool(
        "gate",
        this.tokenA.address,
        this.tokenB.address,
        newRewardToken.address,
        15,
        0,
        { from: accounts[0] }
      ),
      "LMPoolFactory: Reward token is not accepted.")
    });

  });

  describe('Update Pool', function () {

    it("Shouldn't add rewards for inexistent pool",async function(){
      await expectRevert(this.lmPoolFactory.addRewards(this.token.address, '100000000000000000000000000', 3, { from: accounts[0], gasLimit: 1000000 }),
        "Pool not found");
    });    

    it('should withdraw', async function() {      
      await this.lmPoolFactory.addRewards(this.lmPool.address, '100000000000000000000000000', 3, { from: accounts[0], gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(accounts[0])).toString(), '9999999900000000000000000000000000', 'Incorrect balance');

      await this.lmPoolFactory.withdraw(this.token.address, accounts[0], '900000000000000000000000', { from: accounts[0], gasLimit: 1000000 });
      assert.equal((await this.token.balanceOf(accounts[0])).toString(), '9999999900900000000000000000000000', 'Incorrect balance');
    });

  });

});

function sumStrings(a,b) { 
  return ((BigInt(a)) + BigInt(b)).toString();
}

function subStrings(a,b) { 
  return ((BigInt(a)) - BigInt(b)).toString();
}
