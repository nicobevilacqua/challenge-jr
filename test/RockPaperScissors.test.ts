import { Contract } from '@ethersproject/contracts';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

const { utils } = ethers;

enum Move {
	Rock,
	Paper,
	Scissors,
}

/*
	STEPS:
		1. user1 allows contract to transfer x tokens
		2. user1 calls "pay" method and contract transfers x tokens from user1
		3. user2 allows contract to transfer x tokens
		4. user2 callls "pay" method and contract transfers x tokens from user2
		5. user1 calls "move" with hashed move
		6. user2 calls "move" with hashed move
		7. user1 calls "reveal" with password and plain move, if user2 has revelead his move, then call "decideWinner"
		8. user2 calls "reveal" with passowrd and plain move, if user1 has revelead his move, then call "decideWinner"
		9. decideWinner is called, the tokens are transfered to the winner or returned if there is no one.
*/

const GAME_PAYMENT_AMOUNT = utils.parseEther('0.1');

describe('RokPaperScissors', () => {
	let contract: Contract;
	let token: Contract;
	let owner: SignerWithAddress;
	let player1: SignerWithAddress;
	let player2: SignerWithAddress;
	let outsider: SignerWithAddress;
	beforeEach(async () => {
		[owner, player1, player2, outsider] = await ethers.getSigners();
		const [TokenFactory, Factory] = await Promise.all([
			ethers.getContractFactory('ExampleERC20'),
			ethers.getContractFactory('RockPaperScissors'),
		]);

		token = await TokenFactory.connect(owner).deploy();
		await token.deployed();

		contract = await Factory.connect(owner).deploy(token.address, GAME_PAYMENT_AMOUNT);
		await contract.deployed();

		const [tx1, tx2, tx3] = await Promise.all([
			token.connect(owner).transfer(player1.address, utils.parseEther('1')),
			token.connect(owner).transfer(player2.address, utils.parseEther('1')),
			token.connect(owner).transfer(outsider.address, utils.parseEther('1')),
		]);

		await Promise.all([tx1.wait(), tx2.wait(), tx3.wait()]);
	});

	describe('the game is still empty', () => {
		it('declareWinner should fail');
		it('move should fail');
		it('reveal should fail');
		it('declareWinner should fail');
		it('withdraw should fail');

		describe('player1 wants to join the game', () => {
			it(`'move' should fail if player1 hasn't approved the payment`);

			describe('and he has approved the payment', () => {
				beforeEach(async () => {
					const tx = await token.approve(contract.address, GAME_PAYMENT_AMOUNT);
					tx.wait();
				});

				it(`player1 should be able to call 'move'`);
			});
		});
	});
});
