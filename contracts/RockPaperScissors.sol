//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

interface ERC20 {
  function transfer(address _to, uint256 _value) external returns (bool success);
  function allowance(address _owner, address _spender) external view returns (uint256 remaining);
  function transferFrom(address _from, address _to, uint256 _value) external returns (bool success);
  function balanceOf(address account) external view returns (uint256 amount);
}

enum Move { Empty, Rock, Paper, Scissors }

contract RockPaperScissors {

  uint256 public amount;
  ERC20 public token;

  struct PlayerMove {
    bytes32 encoded;
    Move value;
  }

  mapping(Move => mapping(Move => uint8)) public results;

  mapping(address => PlayerMove) public playersMove;
  
  address public player1;
  address public player2;

  address public winner;
  bool public active;

  uint256 public createdAt;

  constructor(address _tokenAddress, uint256 _amount, address _player1, address _player2) {
    token = ERC20(_tokenAddress);
    amount = _amount;

    player1 = _player1;
    player2 = _player2;

    active = true;
    createdAt = block.timestamp;

    results[Move.Rock][Move.Scissors] = 1;
    results[Move.Rock][Move.Paper] = 2;
    results[Move.Paper][Move.Rock] = 1;
    results[Move.Paper][Move.Scissors] = 2;
    results[Move.Scissors][Move.Paper] = 1;
    results[Move.Scissors][Move.Rock] = 2;
  }

  modifier isGameFull() {
    require(player1 != address(0) && player2 != address(0), "Game is not full");
    _;
  }

  modifier isPlayer() {
    require(player1 == msg.sender || player2 == msg.sender, "User is not a player");
    _;
  }

  function play(bytes32 _encodedMove) public isPlayer {
    require(playersMove[msg.sender].encoded == "", "User has already played");
    
    token.transferFrom(msg.sender, address(this), amount);

    playersMove[msg.sender] = PlayerMove({
      encoded: _encodedMove,
      value: Move.Empty
    });
  }

  function getEncodedMove(string calldata _password, Move _move) public pure returns(bytes32) {
    return keccak256(abi.encodePacked(_password, _move));
  }

  function reveal(string calldata _password, Move _move) public isGameFull isPlayer {
    require(playersMove[msg.sender].value == Move.Empty, "Move already revealed");
    require(getEncodedMove(_password, _move) == playersMove[msg.sender].encoded, "Invalid move");

    playersMove[msg.sender].value = _move;
  }

  function declareWinner() public isGameFull {
    require(active, "winner already declared");
    active = false;
    
    Move player1Move = playersMove[player1].value;
    Move player2Move = playersMove[player2].value;

    require(player1Move != Move.Empty, "player1 must move");
    require(player2Move != Move.Empty, "player2 must move");

    uint8 winnerPlayer = results[player1Move][player2Move];

    if (winnerPlayer == 0) {
      token.transfer(player1, amount);
      token.transfer(player2, amount);
      return;
    }

    if (winnerPlayer == 1) {
      winner = player1;
      token.transfer(player1, token.balanceOf(address(this)));
      return;
    }

    if (winnerPlayer == 2) {
      winner = player2;
      token.transfer(player2, token.balanceOf(address(this)));
      return;
    }
  }

  function withdraw() public isPlayer {
    // can withdraw only if the other player has not moved yet
    if (player1 == msg.sender) {
      require(playersMove[player2].value == Move.Empty, "player2 has already moved");
      player1 = address(0);
    } else {
      require(playersMove[player1].value == Move.Empty, "player1 has already moved");
      player2 = address(0);
    }

    active = false; // disable game
    token.transfer(msg.sender, amount);
  }
}

contract RockPaperScissorsPro {

  mapping(address => RockPaperScissors) public games; // all games

  mapping(address => mapping(address => address)) public activeGameWith; // active and last games
  mapping(address => address[]) public playerGamesList; // history

  address[] public players; // all players

  function _newGame(address _adversary, address _token, uint256 _amount) internal {
    RockPaperScissors game = new RockPaperScissors(_token, _amount, msg.sender, _adversary);
    
    address gameAddress = address(game);
    
    games[gameAddress] = game;

    activeGameWith[msg.sender][_adversary] = gameAddress;

    // save on both players games list
    if (playerGamesList[msg.sender].length == 0) {
      players.push(msg.sender);
    }
    playerGamesList[msg.sender].push(gameAddress);

    if (playerGamesList[_adversary].length == 0) {
      players.push(_adversary);
    }
    playerGamesList[_adversary].push(gameAddress);
  }

  function newGame(address _adversary, address _token, uint256 _amount) public {
    address gameAddress = activeGameWith[msg.sender][_adversary];
    
    RockPaperScissors game = games[gameAddress];

    require(gameAddress == address(0) || !game.active(), "game running");

    _newGame(_adversary, _token, _amount);
  }

  function getActiveGameWith(address _adversary) public view returns (address) {
    return activeGameWith[msg.sender][_adversary];
  }

  struct PlayerBoard {
    address player;
    uint256 games;
    uint256 wins;
    uint256 defeats;
    uint256 earned;
    uint256 lost;
  }

  function _getPlayerScoreBoard(address _player) internal view returns(PlayerBoard memory) {
    PlayerBoard memory playerBoard;
    playerBoard.player = _player;
    
    address[] memory gamesList = playerGamesList[_player]; 

    playerBoard.games = gamesList.length;

    for (uint256 i = 0; i < gamesList.length; i++) {
      RockPaperScissors game = games[gamesList[i]];

      uint256 amount = game.amount();
      address winner = game.winner();
      if (winner != address(0)) {
        if (game.winner() == _player) {
          playerBoard.wins++;
          playerBoard.earned += amount;
        } else {
          playerBoard.defeats++;
          playerBoard.lost += amount;
        }
      }
    }

    return playerBoard;
  }

  function getPlayerScoreBoard(address _player) public view returns(uint256, uint256, uint256, uint256) {
    PlayerBoard memory board = _getPlayerScoreBoard(_player);
    return (board.wins, board.defeats, board.earned, board.lost);
  }

  function getScoreBoard() public view returns (PlayerBoard[] memory) {
    PlayerBoard[] memory board = new PlayerBoard[](players.length);

    for(uint256 i = 0; i < players.length; i++) {
      address player = players[i];
      PlayerBoard memory playerBoard = _getPlayerScoreBoard(player);
      board[i] = playerBoard;
    }

    return board;  
  }
}