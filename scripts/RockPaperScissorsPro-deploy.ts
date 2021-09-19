import { ethers, run } from 'hardhat';

async function main() {
  const RockPaperScissorsPro = await ethers.getContractFactory('RockPaperScissorsPro');
  const contract = await RockPaperScissorsPro.deploy();

  await contract.deployed();

  console.log('RockPaperScissorsPro deployed to:', contract.address);

  if (!!process.env.VERIFY) {
    // wait until the contract is available across the entire net
    console.log('waiting');
    await new Promise((resolve) => setTimeout(resolve, 1000 * 30));

    await run('verify:verify', {
      address: contract.address,
      constructorArguments: [],
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
