let Token = artifacts.require("./mocks/Token.sol");
let PairTokenA = artifacts.require("./mocks/PairTokenA.sol");
let PairTokenB = artifacts.require("./mocks/PairTokenB.sol");
let LMPool = artifacts.require("./LMPool.sol");
let LMPoolFactory = artifacts.require("./LMPoolFactory.sol");

const chainId = 3; //Ropsten

module.exports = async (deployer, network, accounts) => {  
  
  //Only for test porpouse
  await deployer.deploy(Token);
  await deployer.deploy(PairTokenA);
  await deployer.deploy(PairTokenB);  
  //Only for test porpouse
  
  await deployer.deploy(LMPoolFactory);
  let factory = await LMPoolFactory.deployed();  

};
