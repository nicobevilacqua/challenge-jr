# Game description

The game consists of two contracts. 

## RockPaperScissors.sol

The first contract is **RockPaperScissors.sol**. This contract is which has the game logic.

When two users want to play with each other a **RockPaperScissors.sol** contract must be deployed calling the constructor with these parameters:

```
constructor(address _tokenAddress, uint256 _amount, address _player1, address _player2)
```

- **_tokenAddress**: An **ERC20** contract address which will be used to pay a reward in tokens to the game winner (or returned to their owners if there is a tie).
- **_amount**: The amount of tokens that each player must locked on the contract in order to play the game.
- **_player1**: First player address.
- **_player2**: Second player address.

### Game steps:
1. The game contract is deployed on the blockchain.
2. Each player allows the contract to transfer **amount** tokens from their wallets through the ERC20 token contract.
3. Each user calls **play()** with his encoded move (obtained through **getEncodedMove()**). **amount** tokens are transfered from the player address to the contract address and locked until the game finishes.
4. (3.1) If a player wants to recover his tokens and finish the game. He can call **withdraw()**, recover his tokens, and terminate the game. This can be done only if his adversary hasn't moved yet.
5. After both players have played, each one have to call **reveal()** with their password and raw move. When the second player reveals his move, a winner is declared and the game finishes.
6. Each player should call **claimRewards()** in order to unlock their tokens. Losers won't receive anything.
7. If the game hasn't finished in 24 hours and a player has never sent his move, then the affected player can call **penalizeInactiveUser()** and transfer all the locked tokens to his address, penalizing the uncooperative player.

### Functions

#### getEncodedMove
```
function getEncodedMove(string calldata _password, Move _move) public view returns(bytes32)
```
Helper function that players must use to generate their encoded move.

#### play
```
function play(bytes32 _encodedMove) public isPlayer isGameActive playerHasNotPlayed
```
This function must be called by both players after they approved the contract to transfer **amount** tokens from their wallets. **_encodeMove** must be generated using the helper function **getEncodedMove**.

Will fail if the contract cannot transfer and locked **amount** tokens from player wallet.

#### reveal
```
function reveal(string calldata _password, Move _move) public isPlayer isGameActive
```
This function must be called by both players after each one has submitted their encoded moves and the tokens were already locked.

The players should send their passwords and moves used to generate **_encodedMove** through the function **getEncodedMove**.
If both players have already revealed their moves, then the game is finished and a winner is declared.

#### claimReward
```
function claimReward() public isPlayer isGameInactive unclaimedReward
```
Function that must be called by players in order to claim their rewards (if there is any).

#### penalizeInactiveUser
```
function penalizeInactiveUser() public isPlayer unclaimedReward playerHasMoved
```
Function that could be called by a player if their adversary never finishes his move and more than 24 hours have passed since contract creation. The uncooperative player will be penalized and all the tokens will be trasnfered to the player.

#### withdraw
```
function withdraw() public isPlayer isGameActive playerHasPlayed
```
Function that a player can call if he wants to recover his tokens without play. This can be done only if his adversary has not played before. If this function is called, the tokens will be transfered to their owner and the game will be deactivated.

## RockPaperScissorsPro.sol

The second contract is **RockPaperScissorsPro.sol**. This contract acts as a dapp interface where different users can play with others and a history of games is saved.

### functions

#### newGame
```
function newGame(address _adversary, address _token, uint256 _amount)
```
A function that a dapp can call in order to create a new game between **msg.sender** and **_adversary**. A **RockPaperScissors.sol** contract is deployed and the game address is saved.

#### getPlayerGames
```
function getPlayerGames(address _player) public view returns(address[] memory)
```
Get a list of game addresses where **_player** has been a participant.

#### getActiveGameWith
```
function getActiveGameWith(address _adversary) public view returns (address)
```
Get the game address between **msg.sender** and **_adversary** it this exists.