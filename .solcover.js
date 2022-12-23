module.exports = {
    skipFiles: ["./mocks/Token.sol","./mocks/PairTokenA.sol","./mocks/PairTokenB.sol"],
    client: require('ganache-cli'),
  };