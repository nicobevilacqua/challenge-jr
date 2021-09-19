//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

interface ERC20 {
  function transfer(address _to, uint256 _value) external returns (bool success);
  function allowance(address _owner, address _spender) external view returns (uint256 remaining);
  function transferFrom(address _from, address _to, uint256 _value) external returns (bool success);
  function balanceOf(address account) external view returns (uint256 amount);
}

contract RockPaperScissors {
  enum Move { Empty, Rock, Paper, Scissors }

  uint256 public amount;
  ERC20 public token;

  struct PlayerMove {
    bytes32 encoded;
    Move value;
  }

  mapping(Move => mapping(Move => address)) public results;

  mapping(address => bool) public rewardClaimed;

  mapping(address => PlayerMove) public playersMove;
  
  address public player1;
  address public player2;

  address public winner;
  
  bool public active;

  uint256 public createdAt;

  constructor(address _tokenAddress, uint256 _amount, address _player1, address _player2) {
    require(_player1 != address(0), "player1 is invalid");
    require(_player2 != address(0), "player2 is invalid");

    token = ERC20(_tokenAddress);
    amount = _amount;

    player1 = _player1;
    player2 = _player2;

    active = true;

    createdAt = block.timestamp;

    results[Move.Rock][Move.Scissors] = player1;
    results[Move.Rock][Move.Paper] = player2;
    results[Move.Paper][Move.Rock] = player1;
    results[Move.Paper][Move.Scissors] = player2;
    results[Move.Scissors][Move.Paper] = player1;
    results[Move.Scissors][Move.Rock] = player2;
  }

  modifier isGameActive() {
    require(active, "Game is not active");
    _;
  }

  modifier isGameInactive() {
    require(!active, "Game is still active");
    _;
  }

  modifier isPlayer() {
    require(player1 == msg.sender || player2 == msg.sender, "Sender is not a player");
    _;
  }

  modifier isGameComplete() {
    require(_getGameIsComplete(), "Incompleted game");
    _;
  }

  modifier isGameIncomplete() {
    require(!_getGameIsComplete(), "Complete game");
    _;
  }

  modifier unclaimedReward() {
    require(!rewardClaimed[msg.sender], "Reward already claimed");
    _;
  }

  modifier playerHasMoved() {
    require(_playerHasMoved(msg.sender), "Player has not moved yet");
    _;
  }

  function _playerHasMoved(address player) internal view returns(bool) {
    return playersMove[player].value != Move.Empty;
  }

  function _playerHasPlayed(address player) internal view returns(bool) {
    return playersMove[player].encoded != "";
  }

  modifier playerHasPlayed() {
    require(_playerHasPlayed(msg.sender), "Player has not played yet");
    _;
  }

  modifier playerHasNotPlayed() {
    require(!_playerHasPlayed(msg.sender), "Player has already played");
    _;
  }

  function _getPlayerAdversary(address player) internal view returns(address) {
    if (player == player1) {
      return player2;
    } 
    if (player == player2) {
      return player1;
    }
    return address(0);
  }

  function play(bytes32 _encodedMove) public isPlayer isGameActive playerHasNotPlayed {    
    token.transferFrom(msg.sender, address(this), amount);

    playersMove[msg.sender] = PlayerMove({
      encoded: _encodedMove,
      value: Move.Empty
    });
  }

  function getEncodedMove(string calldata _password, Move _move) public view returns(bytes32) {
    return keccak256(abi.encodePacked(address(this), _password, _move));
  }

  function withdraw() public isPlayer isGameActive playerHasPlayed {    
    address adversary = _getPlayerAdversary(msg.sender);
    require(!_playerHasPlayed(adversary), "Adversary has already moved");

    active = false;
    token.transfer(msg.sender, amount);
  }

  function _reveal(string calldata _password, Move _move) internal {
    require(playersMove[msg.sender].value == Move.Empty, "Move already revealed");
    require(getEncodedMove(_password, _move) == playersMove[msg.sender].encoded, "Invalid move");

    playersMove[msg.sender].value = _move;
  }

  function _getGameIsComplete() internal view returns(bool) {
    return playersMove[player1].value != Move.Empty && playersMove[player2].value != Move.Empty;
  }

  function _finishGame() internal {
    active = false;

    Move player1Move = playersMove[player1].value;
    Move player2Move = playersMove[player2].value;    

    winner = results[player1Move][player2Move];
  }

  function reveal(string calldata _password, Move _move) public isPlayer isGameActive {
    require(_playerHasPlayed(_getPlayerAdversary(msg.sender)), "adversary hasn't play yet");

    _reveal(_password, _move);

    // declare a winner if both players have already played
    if (_getGameIsComplete()) {
      _finishGame();  
    }
  }

  function loser() public view returns(address) {
    if (winner == address(0)) {
      return address(0);
    }

    return _getPlayerAdversary(winner);
  }

  function claimReward() public isPlayer isGameInactive unclaimedReward {
    // claim reward one time
    rewardClaimed[msg.sender] = true;

    uint256 reward;

    // tie
    if (winner == address(0)) {
      reward = amount;
    }

    // win
    if (winner == msg.sender) {
      reward = amount * 2;
    }

    if (reward > 0) {
      token.transfer(msg.sender, reward);
    }
  }

  function penalizeInactiveUser() public isPlayer unclaimedReward playerHasMoved {
    require(createdAt <= block.timestamp - 1 days, "You should wait 1 day");
    
    active = false;
    rewardClaimed[msg.sender] = true;

    address adversary = _getPlayerAdversary(msg.sender);
    if (!_playerHasMoved(adversary)) {
      token.transfer(msg.sender, amount * 2);
    }
  }
}

