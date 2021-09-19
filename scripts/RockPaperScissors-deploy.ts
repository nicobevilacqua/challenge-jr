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

  const [player1, player2] = await ethers.getSigners();

  const parsedAmount = ethers.utils.parseEther(amount);

  const RockPaperScissors = await ethers.getContractFactory('RockPaperScissors');
  const contract = await RockPaperScissors.deploy(
    tokenAddress,
    parsedAmount,
    player1.address,
    player2.address
  );

  await contract.deployed();

  console.log('RockPaperScissors deployed to:', contract.address);

  if (!!process.env.VERIFY) {
    // wait until the contract is available across the entire net
    console.log('waiting');
    await new Promise((resolve) => setTimeout(resolve, 1000 * 30));

    await run('verify:verify', {
      address: contract.address,
      constructorArguments: [tokenAddress, parsedAmount],
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
