//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

interface ERC20 {
  function transfer(address _to, uint256 _value) external returns (bool success);
  function allowance(address _owner, address _spender) external view returns (uint256 remaining);
  function transferFrom(address _from, address _to, uint256 _value) external returns (bool success);
}

contract RockPaperScissors {

  enum Move { Empty, Rock, Paper, Scissors }

  uint256 public amount;
  ERC20 public token;

  struct Player {
    bytes32 encodedMove;
    Move move;
  }

  mapping(Move => mapping(Move => uint8)) public results;

  mapping(address => Player) public players;

  bool private winnerDeclared = false;
  
  address public player1;
  address public player2;

  constructor(address _tokenAddress, uint256 _amount) {
    token = ERC20(_tokenAddress);
    amount = _amount;

    results[Move.Rock][Move.Rock] = 0;
    results[Move.Rock][Move.Paper] = 2;
    results[Move.Rock][Move.Scissors] = 1;
    results[Move.Paper][Move.Paper] = 0;
    results[Move.Paper][Move.Rock] = 1;
    results[Move.Paper][Move.Scissors] = 2;
    results[Move.Scissors][Move.Scissors] = 0;
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

  function play(bytes32 _encodedMove) public {
    require(player1 == address(0) || player2 == address(0), "Game is full");
    require(players[msg.sender].encodedMove == "", "User has already played");
    require(token.allowance(msg.sender, address(this)) >= amount, "Amount not approved");

    token.transferFrom(msg.sender, address(this), amount);

    Player memory player = Player({
      encodedMove: "",
      move: Move.Empty
    });
    players[msg.sender] = player;

    if (player1 == address(0)) {
      player1 = msg.sender;
    } else {
      player2 = msg.sender;
    }

    players[msg.sender].encodedMove = _encodedMove;
  }

  function getEncodedMove(string calldata _password, Move _move) public pure returns(bytes32) {
    bytes32 encodedMove = keccak256(abi.encodePacked(_password, _move));
    return encodedMove;
  }

  function reveal(string calldata _password, Move _move) public isGameFull isPlayer {
    require(players[msg.sender].move == Move.Empty, "Move already revealed");
    
    bytes32 validationString = keccak256(abi.encodePacked(_password, _move));
    require(validationString == players[msg.sender].encodedMove, "Invalid move");

    players[msg.sender].move = _move;
  }

  function declareWinner() public isGameFull {
    require(!winnerDeclared, "winner already declared");
    winnerDeclared = true;
    
    Move player1Move = players[player1].move;
    Move player2Move = players[player2].move;

    require(player1Move != Move.Empty, "player1 must move");
    require(player2Move != Move.Empty, "player2 must move");

    uint8 winner = results[player1Move][player2Move];

    if (winner == 0) {
      token.transfer(player1, amount);
      token.transfer(player2, amount);
      return;
    }

    if (winner == 1) {
      token.transfer(player1, amount * 2);
      return;
    }

    if (winner == 2) {
      token.transfer(player2, amount * 2);
      return;
    }
  }

  function withdraw() public isPlayer {
    // can withdraw only if the other player has not moved yet
    if (player1 == msg.sender) {
      require(players[player2].move == Move.Empty, "player2 has already moved");
      player1 = address(0);
      token.transfer(msg.sender, amount);
    } else {
      require(players[player1].move == Move.Empty, "player1 has already moved");
      player2 = address(0);
      token.transfer(msg.sender, amount);
    }
  }
}
