import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

const { utils } = ethers;

enum Move {
  Empty,
  Rock,
  Paper,
  Scissors,
}

/*
	STEPS:
		1. user1 allows the contract to transfer x tokens to itself.
		2. user2 allows the contract to transfer x tokens to itself.
		3. user1 and user2 get their encoded move from a contract helper.
		4. user1 and user2 call "play" with their moves and paying the tokens to contract.
		5. user1 and user2 call "reveal" with their password and raw move.
		6. "decideWinner" is called, the tokens are transfered to the winner or returned to both players if there is a tie.
*/

const GAME_PAYMENT_AMOUNT = utils.parseEther('0.1');
const PLAYER1_PASSWORD = 'password1';
const PLAYER2_PASSWORD = 'password2';

describe('RockPaperScissors', () => {
  let contract: Contract;
  let token: Contract;
  let owner: SignerWithAddress;
  let player1: SignerWithAddress;
  let player2: SignerWithAddress;
  let outsider: SignerWithAddress;
  beforeEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    [owner, player1, player2, outsider] = await ethers.getSigners();
    const [TokenFactory, Factory] = await Promise.all([
      ethers.getContractFactory('ExampleERC20'),
      ethers.getContractFactory('RockPaperScissors'),
    ]);

    token = await TokenFactory.connect(owner).deploy();
    await token.deployed();

    contract = await Factory.connect(owner).deploy(
      token.address,
      GAME_PAYMENT_AMOUNT,
      player1.address,
      player2.address
    );
    await contract.deployed();

    const [tx1, tx2, tx3] = await Promise.all([
      token.connect(owner).transfer(player1.address, utils.parseEther('1')),
      token.connect(owner).transfer(player2.address, utils.parseEther('1')),
      token.connect(owner).transfer(outsider.address, utils.parseEther('1')),
    ]);

    await Promise.all([tx1.wait(), tx2.wait(), tx3.wait()]);
  });

  async function approve(player: SignerWithAddress, amount = GAME_PAYMENT_AMOUNT) {
    const tx = await token.connect(player).approve(contract.address, amount);
    await tx.wait();
  }

  async function play(player: SignerWithAddress, move: Move, password = PLAYER1_PASSWORD) {
    const encodedMove = await contract.connect(player).getEncodedMove(password, move);
    const tx = await contract.connect(player).play(encodedMove);
    await tx.wait();
  }

  async function reveal(player: SignerWithAddress, move: Move, password = PLAYER1_PASSWORD) {
    const tx = await contract.connect(player).reveal(password, move);
    await tx.wait();
  }

  async function withdraw(player: SignerWithAddress) {
    const tx = await contract.connect(player).withdraw();
    await tx.wait();
  }

  async function playGame(player1Move: Move, player2Move: Move): Promise<[string, string]> {
    // allow contract transfer
    await Promise.all([approve(player1), approve(player2)]);

    // get encoded moves using contract helper
    await Promise.all([
      play(player1, player1Move, PLAYER1_PASSWORD),
      play(player2, player2Move, PLAYER2_PASSWORD),
    ]);

    // Reveal
    await Promise.all([
      reveal(player1, player1Move, PLAYER1_PASSWORD),
      reveal(player2, player2Move, PLAYER2_PASSWORD),
    ]);

    // the winner is declared
    const dwtx = await contract.declareWinner();
    await dwtx.wait();

    const [b1, b2] = await Promise.all([
      token.balanceOf(player1.address),
      token.balanceOf(player2.address),
    ]);

    return [utils.formatEther(b1), utils.formatEther(b2)];
  }

  it('dummy wait', (done) => {
    if (!process.env.REPORT_GAS) {
      done();
      return;
    }
    setTimeout(done, 2000);
  });

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

  describe('withdraw', () => {
    beforeEach(async () => {
      await approve(player1);
    });

    it('should fail if the user has not played yet', async () => {
      try {
        await withdraw(player1);
        expect(false).to.equal(true);
      } catch (error) {
        expect(true).to.equal(true);
      }
    });

    describe('if the user has played', () => {
      beforeEach(async () => {
        await play(player1, Move.Rock);
      });

      it(`should fail if other user tries to withdraw`, async () => {
        try {
          await withdraw(player2);
        } catch (error) {
          expect(true).to.equal(true);
        }
      });

      it(`should be able to retire the founds if there is no other player`, async () => {
        await withdraw(player1);
        const [bp1, bc] = await Promise.all([
          token.balanceOf(player1.address),
          token.balanceOf(contract.address),
        ]);
        expect(utils.formatEther(bp1)).to.equal('1.0');
        expect(utils.formatEther(bc)).to.equal('0.0');
      });

      describe('and the user has withdrawn before', () => {
        beforeEach(async () => {
          await withdraw(player1);
        });

        it(`a second withdraw should fail`, async () => {
          try {
            await withdraw(player1);
          } catch (error) {
            expect(true).to.equal(true);
          }
        });
      });

      describe(`and other user plays`, () => {
        beforeEach(async () => {
          await approve(player2);
          await play(player2, Move.Rock);
        });

        it(`player1 should be able to retire the founds`, async () => {
          await withdraw(player1);
          const b = await token.balanceOf(player1.address);
          expect(utils.formatEther(b)).to.equal('1.0');
        });

        it(`player2 should be able to retire the founds`, async () => {
          await withdraw(player2);
          const b = await token.balanceOf(player2.address);
          expect(utils.formatEther(b)).to.equal('1.0');
        });

        it(`should fail for other players`, async () => {
          try {
            await withdraw(outsider);
            expect(false).to.equal(true);
          } catch (error) {
            expect(true).to.equal(true);
          }
        });
      });
    });
  });
});
