
import React from 'react';
import Prando from 'prando';
import openSocket from 'socket.io-client';

import Player from './Player';
import Skeleton from './Skeleton';

import Background from './Background';
import Foreground from './Foreground';

import GameOver from './GameOver';
import GetReady from './GetReady';

import Dragon from './Dragon';

import ControlPrompt from './ControlPrompt'

import suddenatksound from '../../assets/game/lunatic_eyes.mp3';
import pointSound from '../../assets/game/sfx_point.wav';

import Score from './Score';

const GAME_STATE = require('./GameState');

class Game extends React.Component {
  constructor(props){
    super(props);

    this.game = {
      gameState: GAME_STATE.INIT,
      localPlayerId: props.currentUser.id,
      isOver: false,
      scores: props.scores,
      dx: 8,
      entities: [],
      players: [],
    }

    this.rng = new Prando(props.lobbyId);
    this.game.scores = props.scores;
    this.lobbyId = props.lobbyId;
    this.socket = openSocket(window.location.origin);
    this.frame = 0;
    
    this.gameplay_music = new Audio();
    this.gameplay_music.src = suddenatksound;

    this.point_sound = new Audio();
    this.point_sound.src = pointSound;

    this.gameSpoint_soundtate = {
      current: 0,
      getReady: 0,
      game: 1,
      over: 2,
    }
    
    this.loop = this.loop.bind(this);
    this.draw = this.draw.bind(this);
    this.update = this.update.bind(this);
    this.generateSkeletons = this.generateSkeletons.bind(this);
    this.removeSkeleton = this.removeSkeleton.bind(this);
    this.removeDragons = this.removeDragons.bind(this);
    this.removeSkeletons = this.removeSkeletons.bind(this);
    this.gameOverAction = this.gameOverAction.bind(this);
    this.addPlayerstoLobby = this.addPlayerstoLobby.bind(this);
    this.getCurrentPlayer = this.getCurrentPlayer.bind(this);
    this.subscribeToPlayerActions = this.subscribeToPlayerActions.bind(this);
    this.increaseSpeed = this.increaseSpeed.bind(this);
  }
  
  componentDidMount() {
    this.cvs = this.refs.canvas;
    this.ctx = this.cvs.getContext("2d");
    this.ctx.font = "30px Silver";

    this.gameScore = new Score(this.cvs, this.ctx);
    this.bg = new Background(this.cvs, this.ctx);
    this.fg = new Foreground(this.cvs, this.ctx);
    this.getReady = new GetReady(this.cvs, this.ctx);
    this.gameOver = new GameOver(this.cvs, this.ctx);
    this.controlPrompt = new ControlPrompt(this.cvs, this.ctx);    
    
    this.props.getScores();

    this.addPlayertoLobby(this.game.localPlayerId);
    this.props.fetchLobby(this.lobbyId)
      .then(payload => {
        this.lobby = payload.lobby;
        this.addPlayerstoLobby(payload.lobby);
      })
      .then(() => this.mountController())
      .then(() => this.subscribeToPlayerActions());

    this.loop();
  }

  componentWillUnmount() {
    this.socket.off(`relay action to ${this.lobbyId}`);
    this.socket.off(`relay game state to ${this.lobbyId}`); 
  }

  initialize() {
    this.game.gameState = GAME_STATE.READY;
  }

  startGame() {
    this.game.entities = [];
    this.game.entities.push(new Skeleton(this.cvs, this.ctx));

    this.frame = 0;
    this.gameplay_music.currentTime = 0;
    this.gameOver.gameover_music.currentTime = 0;
    this.gameplay_music.play();
    this.gameScore.reset();

    this.game.players.forEach(
      player => player.currentAnimation = player.runningAnimation);

    this.game.gameState = GAME_STATE.RUNNING;
  }

  mountController() {
    document.addEventListener('keydown', (e) => {
      let player = this.getCurrentPlayer();

      if (e.keyCode === 32 || e.keyCode === 40 || e.keyCode === 39) {

        switch (this.game.gameState) {
          case GAME_STATE.INIT:
            break;
          case GAME_STATE.READY:
            break;
          case GAME_STATE.RUNNING:
            break;
          case GAME_STATE.OVER:
            break;
          default:
            break;
        }

        switch (this.game.gameState) {
          case GAME_STATE.INIT:
            break;
          case GAME_STATE.READY:
            this.startGame();
            break;
          case GAME_STATE.RUNNING:
            if (e.keyCode === 32) {
              this.socket.emit("relay action", {
                lobbyId: this.lobbyId,
                playerId: this.game.localPlayerId,
                playerAction: "hop"
              })
            } else if (e.keyCode === 40 && player.jumpCount !== 2) {
              this.socket.emit("relay action", {
                lobbyId: this.lobbyId,
                playerId: this.game.localPlayerId,
                playerAction: "fastfall"
              })
            } else if (e.keyCode === 40 && player.jumpCount === 2 && player.sliding === false) {
              this.socket.emit("relay action", {
                lobbyId: this.lobbyId,
                playerId: this.game.localPlayerId,
                playerAction: "slide"
              })
            }

            if (e.keyCode === 39 && player.airDashCount > 0) {
              this.socket.emit("relay action", {
                lobbyId: this.lobbyId,
                playerId: this.game.localPlayerId,
                playerAction: "airdash"
              });
              this.game.dx = this.game.dx + 6;
            }
            break;
          case GAME_STATE.OVER:
            this.game.players.forEach(
              player => player.currentAnimation = player.idleAnimation);

            this.removeSkeletons();
            this.removeDragons();
            this.gameOver.gameover_music.pause();
            this.game.gameState = GAME_STATE.READY;
            break;
          default:
            break;
        }
      }
    })

    document.addEventListener('keyup', (e) => {
      let player = this.getCurrentPlayer();
      if (e.keyCode === 40 && this.game.gameState === GAME_STATE.RUNNING && player.sliding === true) {
        this.socket.emit("relay action", {
          lobbyId: this.props.lobbyId,
          playerId: this.game.localPlayerId,
          playerAction: "unslide"
        })
      }
    })
  }

  // add a single playerId to local game lobby
  addPlayertoLobby(playerId) {
    let playerIds = this.game.players.map(player => player.playerId)
    let players = this.game.players;

    if (!playerIds.includes(playerId))
      players.push(new Player(this.cvs, this.ctx, playerId, players.length * 20));
  }

  // add all players to local lobby, from fetch
  addPlayerstoLobby(lobby) {
    let playerIds = this.game.players.map(player => player.playerId);

    let players = this.game.players;
    for (let i = 0; i < lobby.players.length; i++) {
      if (!playerIds.includes(lobby.players[i].playerId))
        players.push(new Player(this.cvs, this.ctx, lobby.players[i], 20 + i * 20));
    }
  }

  // remove playerId from local lobby
  removePlayerFromLobby(playerId) {
    let players = this.game.players;
    let index = players.indexOf(playerId);
    players.splice(index, 1);
  }

  // returns the local player entity 
  getCurrentPlayer() {
    return this.game.players.filter(entity =>
      entity instanceof Player && entity.playerId === this.props.currentUser.id)[0];
  }

  // Subscribe socket to player action relay
  subscribeToPlayerActions() {
    this.socket.on(`relay action to ${this.lobbyId}`, 
      ({ playerId, playerAction}) => {
        let player = this.game.players.filter(player => player.playerId === playerId)[0];
      
        switch (this.game.gameState) {
          case "GET_READY":
            break;
          case "RUNNING":
            break;
          case "GAME_OVER":
            break;
          default:
            break;
        }

        if(playerAction === "joinLobby") {
          this.addPlayertoLobby(playerId);
        }

        if (player){
          switch(playerAction) {
            case "leaveLobby":
              this.removePlayerFromLobby(playerId);
              break;
            case "hop":
              player.hop();
              break;
            case "slide":
              player.slide();
              break;
            case "unslide":
              player.unslide();
              break;
            case "fastfall":
              player.fastfall();
              break;
            case "airdash":
              player.airdash();
              break;
            default:
              break;
          }
        }
      });

    this.socket.on(`relay game state to ${this.props.lobbyId}`,
      ({ lobbyId, gameState }) => {
        // console.log(`receive new game state from lobby ${lobbyId}, game state: ${gameState}`);
        switch(gameState){
          case 2:
            // console.log(`Game over son`);
            break;
          case 1:
            // console.log(`playing`);
            break;
          default:
            break;
        }
      });
  } 

  generateSkeletons() {
    if (this.frame % (50 + (Math.floor(this.rng.next() * 25))) === 0 && this.game.gameState === GAME_STATE.RUNNING) {
      this.game.entities.push(new Skeleton(this.cvs, this.ctx));
      // console.log(`Push Skeleton`)
    }
  }

  generateEnemies() {
    if (this.frame % (80 + (Math.floor(this.rng.next() * 25))) === 0) {
      let num = Math.floor(Math.random() * 2) + 1;
      if (num === 1) {
        this.game.entities.push(new Skeleton(this.cvs, this.ctx));
      } else {
        this.game.entities.push(new Dragon(this.cvs, this.ctx));
      }
    }
  }

  removeSkeleton() {
    for (let i = 0; i < this.game.entities.length; i++) {
      if (this.game.entities[i] instanceof Skeleton) {
        if (this.game.entities[i].x < 0 - this.game.entities[i].w) {
          delete this.game.entities[i];
          i--;
        }
      }
    }
  }

  removeSkeletons() {
    for (let i = 0; i < this.game.entities.length; i++) {
      if (this.game.entities[i] instanceof Skeleton) {
        delete this.game.entities[i];
        i--;
      }
    }

  }

  removeDragon() {
    for (let i = 0; i < this.game.entities.length; i++) {
      if (this.game.entities[i] instanceof Dragon) {
        if (this.game.entities[i].x < 0 - this.game.entities[i].w) {
          delete this.game.entities[i];
          i--;
        }
      }
    }
  }

  removeDragons() {
    for (let i = 0; i < this.game.entities.length; i++) {
      if (this.game.entities[i] instanceof Dragon) {
        delete this.game.entities[i];
        i--;
      }
    }
  }

  draw() {
    switch (this.game.gameState) {
      case GAME_STATE.INIT:
        break;
      case GAME_STATE.READY:
        break;
      case GAME_STATE.RUNNING:
        break;
      case GAME_STATE.OVER:
        break;
      default:
        break;
    }

    // this.ctx.fillStyle = '#866286';
    // this.ctx.fillRect(0, 0, this.cvs.width, this.cvs.height);
    this.bg.draw();
    this.fg.draw();
    this.game.entities.forEach(entity => entity.draw())
    this.game.players.forEach(entity => entity.draw())
    this.gameScore.draw(this.game);
    this.getReady.draw(this.game);
    this.gameOver.draw(this.game);
    this.controlPrompt.draw(this.game);
  }

  update() {
    switch (this.game.gameState) {
      case GAME_STATE.INIT:
        this.initialize();
        break;
      case GAME_STATE.READY:
        break;
      case GAME_STATE.RUNNING:
        this.frame++;
        this.removeSkeleton();
        this.removeDragon();

        this.generateEnemies();
        break;
      case GAME_STATE.OVER:
        break;
      default:
        break;
    }

    this.game.players.forEach(entity => {
      entity.update(this.game, this.increaseSpeed);
    });

    this.game.entities.forEach(entity => {
      entity.update(this.game, this.gameScore, this.gameOverAction);
    })
    this.gameScore.update(this.game);
    this.bg.update(this.game);
    this.fg.update(this.game);
  }

  gameOverAction() {
    this.gameplay_music.pause();
    this.gameOver.gameover_music.play();

    this.socket.emit("chat message", {
      lobbyId: this.props.lobbyId,
      msg: `${this.props.currentUser.username} met their end`
    })

    this.game.gameState = GAME_STATE.OVER;

    this.socket.emit("relay game state", {
      lobbyId: this.props.lobbyId,
      gameState: GAME_STATE.OVER,
    });
    this.props.postScore(this.gameScore.score);
    this.bg.reset();
    this.fg.reset();
  }

  increaseSpeed(dx){
    this.game.dx = this.game.dx + dx;
  }

  //loop
  loop() {
    // console.log(`Loop, frame: ${this.frame}`);
    this.update();
    this.draw();
    requestAnimationFrame(this.loop);
  }

  render() {
    return (
      <div tabIndex="0">
        <canvas ref="canvas" id="run-escape" width="800" height="500"></canvas>
      </div>
    );
  }
}

export default Game;