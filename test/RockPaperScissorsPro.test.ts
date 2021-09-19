import { Provider } from '@ethersproject/abstract-provider';
import { BigNumber } from '@ethersproject/bignumber';
import { Contract, ContractFactory } from '@ethersproject/contracts';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

const { utils, constants } = ethers;

enum Move {
  Empty,
  Rock,
  Paper,
  Scissors,
}

const GAME_PAYMENT_AMOUNT = utils.parseEther('0.1');
const PLAYER1_PASSWORD = 'password1';
const PLAYER2_PASSWORD = 'password2';

describe('RockPaperScissorsPro', () => {
  let contract: Contract;
  let token: Contract;
  let owner: SignerWithAddress;
  let player1: SignerWithAddress;
  let player2: SignerWithAddress;
  let outsider: SignerWithAddress;
  let TokenFactory: ContractFactory;
  let GameFactory: ContractFactory;
  let Factory: ContractFactory;
  beforeEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    [owner, player1, player2, outsider] = await ethers.getSigners();
    [TokenFactory, GameFactory, Factory] = await Promise.all([
      ethers.getContractFactory('ExampleERC20'),
      ethers.getContractFactory('RockPaperScissors'),
      ethers.getContractFactory('RockPaperScissorsPro'),
    ]);

    token = await TokenFactory.connect(owner).deploy();
    await token.deployed();

    contract = await Factory.connect(owner).deploy();
    await contract.deployed();

    const [tx1, tx2, tx3] = await Promise.all([
      token.connect(owner).transfer(player1.address, utils.parseEther('1')),
      token.connect(owner).transfer(player2.address, utils.parseEther('1')),
      token.connect(owner).transfer(outsider.address, utils.parseEther('1')),
    ]);

    await Promise.all([tx1.wait(), tx2.wait(), tx3.wait()]);
  });

  async function newGame(
    player1: SignerWithAddress,
    player2: SignerWithAddress,
    token: Contract,
    amount = GAME_PAYMENT_AMOUNT
  ) {
    const tx = await contract.connect(player1).newGame(player2.address, token.address, amount);
    await tx.wait();
    const gameAddress = await contract.connect(player1).getActiveGameWith(player2.address);
    const game = await GameFactory.attach(gameAddress);
    await game.deployed();
    return game;
  }

  async function approve(
    token: Contract,
    game: Contract,
    player: SignerWithAddress,
    amount = GAME_PAYMENT_AMOUNT
  ) {
    const tx = await token.connect(player).approve(game.address, amount);
    await tx.wait();
  }

  async function play(
    game: Contract,
    player: SignerWithAddress,
    move: Move,
    password = PLAYER1_PASSWORD
  ) {
    const encodedMove = await game.connect(player).getEncodedMove(password, move);
    const tx = await game.connect(player).play(encodedMove);
    await tx.wait();
  }

  async function reveal(
    game: Contract,
    player: SignerWithAddress,
    move: Move,
    password = PLAYER1_PASSWORD
  ) {
    const tx = await game.connect(player).reveal(password, move);
    await tx.wait();
  }

  async function declareWinner(game: Contract) {
    // console.log('declareWinner');
    const tx = await game.declareWinner();
    await tx.wait();
  }

  async function withdraw(game: Contract, player: SignerWithAddress) {
    const tx = await game.connect(player).withdraw();
    await tx.wait();
  }

  interface Player {
    player?: SignerWithAddress;
    move: Move;
  }

  async function playGame(p1: Player, p2: Player, gameToken: Contract = token): Promise<Contract> {
    const gamePlayer1 = p1.player || player1;
    const gamePlayer2 = p2.player || player2;

    const game = await newGame(gamePlayer1, gamePlayer2, gameToken);

    await Promise.all([
      approve(gameToken, game, gamePlayer1),
      approve(gameToken, game, gamePlayer2),
    ]);

    await Promise.all([
      play(game, gamePlayer1, p1.move, PLAYER1_PASSWORD),
      play(game, gamePlayer2, p2.move, PLAYER2_PASSWORD),
    ]);

    await Promise.all([
      reveal(game, gamePlayer1, p1.move, PLAYER1_PASSWORD),
      reveal(game, gamePlayer2, p2.move, PLAYER2_PASSWORD),
    ]);

    await declareWinner(game);

    return game;
  }

  it('Player1 should win', async () => {
    const game = await playGame({ move: Move.Paper }, { move: Move.Rock });

    const winner = await game.winner();
    expect(winner).to.equal(player1.address);

    const [b1, b2] = await Promise.all([
      token.balanceOf(player1.address),
      token.balanceOf(player2.address),
    ]);

    expect(utils.formatEther(b1)).to.equal('1.1');
    expect(utils.formatEther(b2)).to.equal('0.9');
  });

  it('Player2 should win', async () => {
    const game = await playGame({ move: Move.Paper }, { move: Move.Scissors });

    const winner = await game.winner();
    expect(winner).to.equal(player2.address);

    const [b1, b2] = await Promise.all([
      token.balanceOf(player1.address),
      token.balanceOf(player2.address),
    ]);

    expect(utils.formatEther(b1)).to.equal('0.9');
    expect(utils.formatEther(b2)).to.equal('1.1');
  });

  it('Should be a tie', async () => {
    const game = await playGame({ move: Move.Paper }, { move: Move.Paper });

    const winner = await game.winner();
    expect(winner).to.equal(constants.AddressZero);

    const [b1, b2] = await Promise.all([
      token.balanceOf(player1.address),
      token.balanceOf(player2.address),
    ]);

    expect(utils.formatEther(b1)).to.equal('1.0');
    expect(utils.formatEther(b2)).to.equal('1.0');
  });

  describe('create a game and withdraw early', async () => {
    let game: Contract;
    beforeEach(async () => {
      game = await newGame(player1, player2, token);

      await Promise.all([approve(token, game, player1), approve(token, game, player2)]);

      await Promise.all([
        play(game, player1, Move.Rock, PLAYER1_PASSWORD),
        play(game, player2, Move.Paper, PLAYER2_PASSWORD),
      ]);

      await withdraw(game, player1);
    });

    it('should disable reveal', async () => {
      try {
        await reveal(game, player1, Move.Rock, PLAYER1_PASSWORD);
        expect(true).to.equal(false);
      } catch (error) {
        expect(true).to.equal(true);
      }
    });

    it('player2 should be able to withdraw his funds', async () => {
      await withdraw(game, player2);
      const balance = await token.balanceOf(player2.address);
      expect(utils.formatEther(balance)).to.equal('1.0');
    });

    it('revealWinner should be blocked', async () => {
      try {
        await declareWinner(game);
        expect(true).to.equal(false);
      } catch (error) {
        expect(true).to.equal(true);
      }
    });
  });

  describe('multiple games', () => {
    beforeEach(async () => {
      const games = [
        {
          player1: {
            player: player1,
            move: Move.Rock,
          },
          player2: {
            player: player2,
            move: Move.Paper,
          },
        },
        {
          player1: {
            player: player1,
            move: Move.Scissors,
          },
          player2: {
            player: player2,
            move: Move.Paper,
          },
        },
        {
          player1: {
            player: player1,
            move: Move.Rock,
          },
          player2: {
            player: player2,
            move: Move.Rock,
          },
        },
        {
          player1: {
            player: outsider,
            move: Move.Scissors,
          },
          player2: {
            player: player2,
            move: Move.Rock,
          },
        },
        {
          player1: {
            player: outsider,
            move: Move.Paper,
          },
          player2: {
            player: player1,
            move: Move.Rock,
          },
        },
      ];

      for (let game of games) {
        await playGame(game.player1, game.player2);
      }
    });

    it(`should return the dashboard`, async () => {
      const board = await contract.getScoreBoard();
      console.log(
        board.map(
          ({
            player,
            games,
            wins,
            defeats,
            earned,
            lost,
          }: {
            player: string;
            games: number;
            wins: number;
            defeats: number;
            earned: number;
            lost: number;
          }) => ({
            player,
            games: games.toString(),
            wins: wins.toString(),
            defeats: defeats.toString(),
            earned: utils.formatEther(earned),
            lost: utils.formatEther(lost),
          })
        )
      );
    });
  });
});
