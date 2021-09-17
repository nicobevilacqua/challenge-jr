import { Contract } from '@ethersproject/contracts';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { TLSSocket } from 'tls';

const { utils } = ethers;

enum Move {
  Empty,
  Rock,
  Paper,
  Scissors,
}

/*
	STEPS:
		1. user1 allows contract to transfer x tokens
		2. user1 calls "pay" method and contract transfers x tokens from user1 to itself
		3. user2 allows contract to transfer x tokens
		4. user2 calls "pay" method and contract transfers x tokens from user2 to itself
		5. user1 gets encoded move from contract helper
		6. user1 calls "move" with hashed move
		7. user2 gets encoded move from contract helper
		8. user2 calls "move" with hashed move
		9. user1 calls "reveal" with password and plain move, if user2 has revelead his move, then call "decideWinner"
		10. user2 calls "reveal" with passowrd and plain move, if user1 has revelead his move, then call "decideWinner"
		11. decideWinner is called, the tokens are transfered to the winner or returned to both players if there is a tie.
*/

const GAME_PAYMENT_AMOUNT = utils.parseEther('0.1');
const PLAYER1_PASSWORD = 'password1';
const PLAYER2_PASSWORD = 'password2';

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

  async function playGame(player1Move: Move, player2Move: Move): Promise<[string, string]> {
    // allow contract transfer
    const [a1, a2] = await Promise.all([
      token.connect(player1).approve(contract.address, GAME_PAYMENT_AMOUNT),
      token.connect(player2).approve(contract.address, GAME_PAYMENT_AMOUNT),
    ]);
    await Promise.all([a1.wait(), a2.wait()]);

    // pay fee
    const [p1, p2] = await Promise.all([
      contract.connect(player1).pay(),
      contract.connect(player2).pay(),
    ]);
    await Promise.all([p1.wait(), p2.wait()]);

    // get encoded moves using contract helper
    const [em1, em2] = await Promise.all([
      contract.connect(player1).getEncodedMove(PLAYER1_PASSWORD, player1Move),
      contract.connect(player2).getEncodedMove(PLAYER2_PASSWORD, player2Move),
    ]);

    // Move
    const [m1, m2] = await Promise.all([
      contract.connect(player1).move(em1),
      contract.connect(player2).move(em2),
    ]);
    await Promise.all([m1.wait(), m2.wait()]);

    // Reveal
    const [r1, r2] = await Promise.all([
      contract.connect(player1).reveal(PLAYER1_PASSWORD, player1Move),
      contract.connect(player2).reveal(PLAYER2_PASSWORD, player2Move),
    ]);
    await Promise.all([r1.wait(), r2.wait()]);

    // the winner is declared
    const dwtx = await contract.declareWinner();
    await dwtx.wait();

    const [b1, b2] = await Promise.all([
      token.balanceOf(player1.address),
      token.balanceOf(player2.address),
    ]);

    return [utils.formatEther(b1), utils.formatEther(b2)];
  }
  it('encoded move should match', async () => {
    const localEncodedMove = utils.solidityKeccak256(
      ['string', 'uint8'],
      [PLAYER1_PASSWORD, Move.Paper]
    );
    const contractEncodedMove = await contract.getEncodedMove(PLAYER1_PASSWORD, Move.Paper);
    expect(localEncodedMove).to.equal(contractEncodedMove);
  });

  it(`player1 should win`, async () => {
    const [b1, b2] = await playGame(Move.Paper, Move.Rock);
    expect(b1).to.equal('1.1');
    expect(b2).to.equal('0.9');
  });

  it(`player2 should win`, async () => {
    const [b1, b2] = await playGame(Move.Paper, Move.Scissors);
    expect(b1).to.equal('0.9');
    expect(b2).to.equal('1.1');
  });

  it(`should be a tie`, async () => {
    const [b1, b2] = await playGame(Move.Paper, Move.Paper);
    expect(b1).to.equal('1.0');
    expect(b2).to.equal('1.0');
  });
});
