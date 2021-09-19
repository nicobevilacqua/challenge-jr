import { BigNumber } from '@ethersproject/bignumber';
import { Contract, ContractFactory } from '@ethersproject/contracts';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, network } from 'hardhat';

const { utils } = ethers;

enum Move {
  Empty,
  Rock,
  Paper,
  Scissors,
}

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
    const encodedMove = await contract.getEncodedMove(password, move);
    const tx = await contract.connect(player).play(encodedMove);
    await tx.wait();
  }

  async function reveal(player: SignerWithAddress, move: Move, password = PLAYER1_PASSWORD) {
    const tx = await contract.connect(player).reveal(password, move);
    await tx.wait();
  }

  async function claimReward(player: SignerWithAddress) {
    const tx = await contract.connect(player).claimReward();
    await tx.wait();
  }

  async function penalizeInactiveUser(player: SignerWithAddress) {
    const tx = await contract.connect(player).penalizeInactiveUser();
    await tx.wait();
  }

  async function withdraw(player: SignerWithAddress) {
    const tx = await contract.connect(player).withdraw();
    await tx.wait();
  }

  async function getFormattedBalance(signer: SignerWithAddress | Contract) {
    const balance = await token.balanceOf(signer.address);
    return utils.formatEther(balance);
  }

  async function testFail(step: Promise<void>) {
    try {
      await step;
    } catch (error) {
      return;
    }
    expect(true).to.equal(false);
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

    await Promise.all([claimReward(player1), claimReward(player2)]);

    const [b1, b2] = await Promise.all([
      token.balanceOf(player1.address),
      token.balanceOf(player2.address),
    ]);

    return [utils.formatEther(b1), utils.formatEther(b2)];
  }

  describe('different winners', () => {
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

  describe('hacking tries', () => {
    it('the game should been terminated if a player withdraw his funds early', async () => {
      // there is no founds yet
      await testFail(withdraw(player1));
      await approve(player1);
      await play(player1, Move.Paper, PLAYER1_PASSWORD);
      await withdraw(player1);
      // shouldn't be able to play again
      await testFail(play(player1, Move.Paper, PLAYER1_PASSWORD));
      // player2 shouldn't be able to play
      await testFail(play(player2, Move.Paper, PLAYER2_PASSWORD));
      // there is no rewards
      await testFail(claimReward(player1));
      await testFail(claimReward(player2));
      // should be able to reveal anything
      await testFail(reveal(player1, Move.Paper, PLAYER1_PASSWORD));

      const [player1Balance, player2Balance, contractBalance] = await Promise.all([
        getFormattedBalance(player1),
        getFormattedBalance(player2),
        getFormattedBalance(contract),
      ]);

      expect(player1Balance).to.equal('1.0');
      expect(player2Balance).to.equal('1.0');
      expect(contractBalance).to.equal('0.0');
    });

    it('steps must be followed in the right order', async () => {
      // should fail without a previews approve on the token
      await testFail(play(player1, Move.Paper, PLAYER1_PASSWORD));
      await approve(player1, GAME_PAYMENT_AMOUNT);
      await play(player1, Move.Paper, PLAYER1_PASSWORD);
      // a second play should fail
      await testFail(play(player1, Move.Paper, PLAYER1_PASSWORD));
      // should fail if player2 hasnt move yet
      await testFail(reveal(player1, Move.Paper, PLAYER1_PASSWORD));
      await approve(player2, GAME_PAYMENT_AMOUNT);
      await play(player2, Move.Scissors, PLAYER2_PASSWORD);

      // the game has not finished yet
      await testFail(claimReward(player1));
      // should wait 1 day
      await testFail(penalizeInactiveUser(player1));
      await testFail(penalizeInactiveUser(player2));
      // cannot withdraw if player2 has already moved
      await testFail(withdraw(player1));
      // should fail with a different move
      await testFail(reveal(player2, Move.Rock, PLAYER2_PASSWORD));
      // should fail with a different password
      await testFail(reveal(player2, Move.Scissors, 'asdasd'));
      await reveal(player2, Move.Scissors, PLAYER2_PASSWORD);
      // should fail
      await testFail(reveal(player2, Move.Scissors, PLAYER2_PASSWORD));
      // should fail if player1 hasn't played yet
      await testFail(claimReward(player1));
      await reveal(player1, Move.Paper, PLAYER1_PASSWORD);
      await claimReward(player1);
      // shouldn't claim the reward twice
      await testFail(claimReward(player1));
      // cannot withdraw at this stage
      await testFail(withdraw(player1));
      // cannot withdraw at this stage
      await testFail(withdraw(player2));
      // cannot withdraw at this stage
      await testFail(withdraw(owner));
      await claimReward(player2);
      // only players can claim rewards
      await testFail(claimReward(owner));
      // cannot withdraw at this stage
      await testFail(withdraw(player1));

      const [player1Balance, player2Balance, contractBalance] = await Promise.all([
        getFormattedBalance(player1),
        getFormattedBalance(player2),
        getFormattedBalance(contract),
      ]);

      expect(player1Balance).to.equal('0.9');
      expect(player2Balance).to.equal('1.1');
      expect(contractBalance).to.equal('0.0');
    });
    it('outsider cannot call play', async () => {
      try {
        await play(outsider, Move.Rock);
        expect(true).to.equal(false);
      } catch (error) {
        expect(true).to.equal(true);
      }
    });

    it('outsider cannot call reveal', async () => {
      try {
        await play(outsider, Move.Rock);
        expect(true).to.equal(false);
      } catch (error) {
        expect(true).to.equal(true);
      }
    });
  });

  describe(`penalize inactive player`, () => {
    beforeEach(async () => {
      // allow contract transfer
      await Promise.all([approve(player1), approve(player2)]);

      // get encoded moves using contract helper
      await Promise.all([
        play(player1, Move.Rock, PLAYER1_PASSWORD),
        play(player2, Move.Paper, PLAYER2_PASSWORD),
      ]);

      // Reveal
      await reveal(player1, Move.Rock, PLAYER1_PASSWORD);
    });

    it('cannot penalize a player before 1 day has passed', async () => {
      await testFail(penalizeInactiveUser(player1));
    });

    describe(`if 1 day has passed and player2 hasn't finished his move`, () => {
      beforeEach(async () => {
        await network.provider.send('evm_increaseTime', [60 * 60 * 24]);
        await network.provider.send('evm_mine');
        await penalizeInactiveUser(player1);
      });

      it(`player1 should receive all the tokens`, async () => {
        const [contractBalance, playerBalance] = await Promise.all([
          getFormattedBalance(contract),
          getFormattedBalance(player1),
        ]);
        expect(contractBalance).to.equal('0.0');
        expect(playerBalance).to.equal('1.1');
      });

      it('player1 cannot claim the tokens again', async () => {
        await testFail(penalizeInactiveUser(player2));
      });

      it('claimReward cannot be called after the penalization has being clamed', async () => {
        await testFail(claimReward(player1));
      });

      it('player2 cannot withdraw the funds', async () => {
        await testFail(withdraw(player2));
      });

      it('player2 cannot do anything else', async () => {
        await testFail(reveal(player2, Move.Paper, PLAYER2_PASSWORD));
        await testFail(claimReward(player2));
      });
    });
  });
});
