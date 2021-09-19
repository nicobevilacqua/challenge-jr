//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "./RockPaperScissors.sol";

contract RockPaperScissorsPro {
  mapping(address => mapping(address => address)) public activeGameWith; // active and last games
  mapping(address => address[]) public playerGamesList; // history

  address[] public players; // all players

  function getPlayerGames(address _player) public view returns(address[] memory) {
    return playerGamesList[_player];
  }

  function _newGame(address _adversary, address _token, uint256 _amount) internal {
    RockPaperScissors game = new RockPaperScissors(_token, _amount, msg.sender, _adversary);
    
    address gameAddress = address(game);

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
    
    RockPaperScissors game = RockPaperScissors(gameAddress);

    require(gameAddress == address(0) || !game.active(), "game running");

    _newGame(_adversary, _token, _amount);
  }

  function getActiveGameWith(address _adversary) public view returns (address) {
    return activeGameWith[msg.sender][_adversary];
  }
}