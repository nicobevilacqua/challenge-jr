import { ethers, run } from 'hardhat';

async function main() {
  let tokenAddress: string = <string>process.env.TOKEN_ADDRESS;
  const amount: string = <string>process.env.AMOUNT || '0.1';

  if (!tokenAddress) {
    const TokenContract = await ethers.getContractFactory('ExampleERC20');
    const token = await TokenContract.deploy();
    await token.deployed();
    tokenAddress = token.address;
  }

  const parsedAmount = ethers.utils.parseEther(amount);

  const RockPaperScissors = await ethers.getContractFactory('RockPaperScissors');
  const contract = await RockPaperScissors.deploy(tokenAddress, parsedAmount);

  await contract.deployed();

  console.log('RockPaperScissors deployed to:', contract.address);

  await run('verify:verify', {
    address: contract.address,
    constructorArguments: [tokenAddress, parsedAmount],
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
