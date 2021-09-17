import { ethers } from 'hardhat';

async function main() {
  let address: string = <string>process.env.TOKEN_ADDRESS;
  const amount: string = <string>process.env.AMOUNT || '0.1';

  if (!address) {
    const TokenContract = await ethers.getContractFactory('ExampleERC20');
    const token = await TokenContract.deploy();
    await token.deployed();
    address = token.address;
  }

  const RockPaperScissors = await ethers.getContractFactory('RockPaperScissors');
  const contract = await RockPaperScissors.deploy(address, ethers.utils.parseEther(amount));

  await contract.deployed();

  console.log('RockPaperScissors deployed to:', contract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
