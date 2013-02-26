$(document).ready(function() {
	(function($) {
		/*
		**************************************************************
		Global variables to hold the game's current state and options.
		**************************************************************
		*/
		var handlers = [];          // Store a reference to each input handler so we can restore them later (we remove input at some points in the game).
		var state = {
			mt: undefined,            // Mersenne Twister object. Used to generate random number sequences with a seed.
			seed: 0,                  // The seed used when generating a random number.
			pattern: [],              // An array of randomly generated numbers, this is the selected color list for the current game.
			levelStart: 1,            // Start at this specific level.
			levelMax: 100,            // The max level. Yeah, serious business.
			level: this.levelStart,   // Store the current level.
			turn: 0,                  // The point you're at within the level, this starts at 0.
			replayProgress: 0,        // Used to prevent the replay point from going past the player's current level.
			time: {                   // Time in milliseconds for certain game mechanics.
				turn: 1500,             // Craziness will ensue if you do not keep the ratios between these 3 numbers the same.
				levelTransition: 750,
				flashColor: 375
			},
			running: false,           // Is the game running or not?
			playedFromURL: false      // Was the game played from a URL?
		};
		var time = {                                   // Default values for the time mechanics, it uses the first state.time values.
			turn: state.time.turn,                       // We store a copy here because the state.time values get mutated each level
			levelTransition: state.time.levelTransition, // and we need a way to revert them back on game end.
			flashColor: state.time.flashColor,
			scale: 1                                     // scale 2 would be twice as fast, 0.5 would be twice as slow, 3 would be 3x as fast, etc..
		};
		var mode = {                // Game mode default settings.
			shuffle: false,           // The color order gets randomly switched every level.
			rotate: false,            // The game board rotates as long as the game is still being played.
			distract: false,          // The player gets randomly distracted by various screen altering effects.
			rotateId: 0,              // The id to track the timeout, keep this at 0.
			distractId: 0             // The id to track the timeout, keep this at 0.
		};
		
		/*
		**************************************************************
		jQuery plugins
		**************************************************************
		*/
		
		// I ripped this function off from a stackoverflow answer.
		// Source: http://stackoverflow.com/a/1533945/709091
		$.fn.randomize = function(childElem) {
			return this.each(function() {
				var $this = $(this);
				var elems = $this.children(childElem);

				elems.sort(function() { return (Math.round(Math.random())-0.5); });

				$this.remove(childElem);

				for(var i = 0; i < elems.length; i++) {
					$this.append(elems[i]);
				}
			});
		};
		
		// Revert the effects of the random list.
		$.fn.resetColors = function(childElem) {
			return this.each(function() {
				var $this = $(this);
				var elems = $this.children(childElem);
				
				// Custom sort function to sort on the id of each element.
				elems.sort(function(a, b) { return a.id - b.id; });

				$this.remove(childElem);

				for(var i = 0; i < elems.length; i++) {
					$this.append(elems[i]);
				}
			});
		};
		
		// Rotate an element by a certain amount of degrees.
		$.fn.rotate = function(degree) {
			return this.each(function() {
				var $this = $(this);
				
				setRotationDegree(degree);
				
				mode.rotateId = setTimeout(function() { $this.rotate(++degree); }, 25);
			});
		};
		
		/*
		**************************************************************
		Event handler setup
		**************************************************************
		*/
		
		// Capture click and touchend events on the share input box so it instantly selects the text.
		$('#share-game').bind('click touchend', function(e) {
			e.stopPropagation();
			e.preventDefault();
			
			this.selectionStart = 0;
			this.selectionEnd = this.value.length;
		});

		// Setup all the handlers.
		function inputHandler(index) {
			return function() {
				// This will be a function we use later to determine which color was clicked.
				color(index);
			};
		}
		
		$('#start').click(function() {
			startGame();
		});
		
		$('#options').click(function() {
			showOptions();
		});
		
		$('#top5').click(function() {
			showScoreboard();
		});
		
		$('#scoreboard-clear').click(function() {
			clearScores();
		});
		
		// One of the distractions uses this, so we cache it to a function and bind/unbind it in the distraction function.
		var mouseCursorHandler = function(e) {
			pointer = $('<img>').attr({'src': 'images/distractions/trollface.png'});
			$(document.body).append(pointer);
			pointer.css({
				'position': 'absolute',
				top: e.pageY + 2,
				left: e.pageX + 2
			}).animate({opacity: 0}, 150, function() { $(this).remove(); });};
		
		for (var key in mode) {
			// Here's a self executing function that acts on a closure.
			// This creates a new variable scope on every step of the loop because
			// variable scope is created at execution state.time.
			// Source: http://www.mennovanslooten.nl/blog/post/62
			(function(closedKey){
				$('#' + closedKey).change(function() {
					if ($(this).is(':checked')) {
						mode[closedKey] = true;
					}
					else {
						mode[closedKey] = false;
					}
				});
			})(key);
		}
		
		// Attach input handlers for each color and cache the handler itself.
		for (var i = 0; i < 6; i++) {
			// Cache the input handler because we will be enabling/disabling clicking later on
			// during the replay of each level.
			// This also acts as a closure to make sure "i"'s value is correctly passed to each handler.
			var fn = inputHandler(i);
			
			// We want to support touching and tapping on mobile devices, not just clicks.
			// The jquery.touchToClick plugin allows us to just bind click but properly handle touching and tapping too.
			// The source of the plugin: https://raw.github.com/cargomedia/jquery.touchToClick
			$('#' + i).bind('click', fn);
			handlers[i] = fn;
		}

		/*
		**************************************************************
		Distractions
		**************************************************************
		*/

		// All of the distractions. They are encapsulated in an object because we pick a random function as a distraction.
		var distractions = {
			playing: false, // Keep track if a distraction is playing or not, we don't want to overlap them.
			// Fade the background of the page to black, wait a bit and revert the fade.
			fadeBackground: function() {
				distractions.playing = true;
				$('body').animate({
					backgroundColor: '#000'
				}, 1500, function() {
					setTimeout(function() {
						$('body').animate({backgroundColor: '#656565'});
						distractions.playing = false;
					}, 1500);
				});
				
			},
			// Nyan cat is on a mission to make you look at his/her glorious colors.
			nyanCat: function() {
				distractions.playing = true;
				
				// Get the browser's width, add 301 because that is the size of the image.
				var width = $('html').width() + 301;
				
				// Animate the browser width over 2 seconds then revert the position.
				$('#distraction-nyancat').animate({left: '+=' + width}, 2000);
				$('#distraction-nyancat').animate({left: '-=' + width}, 2000);

				distractions.playing = false;
			},
			// Fireworks go off at semi-random locations.
			fireworks: function() {
				// Fireworks script provided by http://www.schillmania.com/projects/fireworks/.
				distractions.playing = true;
				createFirework(40, 114 , 2, 5, null, null, null, null, false, true);
				distractions.playing = false;
			},
			// Change the mouse cursor to one of the funniest memes ever created.
			trollTrail: function() {
				distractions.playing = true;
				
				$('#distraction-troll-face').css({display: 'block'});
				$(document).bind('mousemove', mouseCursorHandler);
				
				// Enable it for 5 seconds.
				setTimeout(function() {
					$('#distraction-troll-face').css({display: 'none'});
					$(document).unbind('mousemove');
					distractions.playing = false;
				}, 5000);
			},
			// Genius makes an apparence in today's episode of "distract player".
			genius: function() {
				distractions.playing = true;
				
				// Get the brower's width because we want to center the image.
				// 82 is half the dimension of the image.
				var width = $('html').width() / 2 - 82;
				
				// Get the browser's height, add 157 because that is the size of the image.
				var height = $('html').height() + 157;
				
				// Animate the browser height over 2 seconds.
				$('#distraction-genius').css({left: width, opacity: 0.50});
				$('#distraction-genius').animate({top: '-=' + height}, 6000);
				
				// Reset him.
				setTimeout(function() {
					$('#distraction-genius').css({top: '300px', left: '-164px'});
					distractions.playing = false;
				}, 6000);
			},
			// No application is complete without jackie chan.
			jackie: function() {
				distractions.playing = true;

				// Get the brower's width because we want to center the image.
				// 82 is half the dimension of the image.
				var width = $('html').width() / 2 - 149;
				
				// Get the browser's height, offset it with some math based on the image's height.
				var height = $('html').height() - 272;
				
				// Present him.
				$('#distraction-jackie-chan').css({left: width, top: height});
				
				// Let him bask in all his glory for a few seconds.
				setTimeout(function() {
					$('#distraction-jackie-chan').css({top: '300px', left: '-298px'});
					distractions.playing = false;
				}, 6000);
			}
		};
		
		// Should we distract the player?
		function shouldDistract() {
			var random = Math.random();
			
			// Instantly report false if the game is not running.
			if (!state.running) {
				return false;
			}
			
			// 75% chance to distract the user.
			if (random >= 0.25) {
				return true;
			}
			
			return false;
		}
		
		// Randomly pick between 1000 and 3000. This is the number of milliseconds of each distraction interval.
		function distractionDelay() {
			return Math.floor(Math.random() * 3000) + 1000;
		}
		
		// Pick a random distraction.
		function pickDistraction() {
			var fnArray = [];
			
			for (var k in distractions) {
				// Grab only the functions and put them into an array.
				if (typeof(distractions[k]) === 'function') {
					fnArray.push(distractions[k]);
				}
			}
			
			// Pick a random index from the array.
			fnArray[Math.floor(Math.random() * fnArray.length)]();
		}

		/*
		**************************************************************
		Game setting initialization
		**************************************************************
		*/
		
		// Configure the modes.
		for (var k in mode) {
			$('#' + k).attr('checked', mode[k]);
		}

		// The colors should not be usable when the game is not running and also load the top 5 scoreboard.
		toggleHandlers(false);
		loadTop5();

		// If we have URL params, setup the initial game state. This is handled by the function being called.
		// We want games to start automatically if they originated from a URL.
		setGameState();

		/*
		**************************************************************
		Game startup, tear down and displays
		**************************************************************
		*/

		function startGame(fromLevel) {
			// The game is now running.
			state.running = true;
			
			// Show the level the first time the game is played.
			// We never unhide the level because we want the level to be shown even after the game finishes.
			$('#level').css('visibility', 'visible').html('Level: <span id="points" class="highlight">' + state.levelStart + "</span>");
		
			// We hide a few elements to remove some clutter from the screen.
			// We want to eliminate as many distractions as possible while the game itself is running.
			$('#share').css('visibility', 'hidden');
			$('#logo').css('visibility', 'hidden');
			$('#buttons').css('visibility', 'hidden');
			$('#directions').css('visibility', 'hidden');
			$('#option-list').css('display', 'none');
			$('#scoreboard').css('display', 'none');
			$('#game-background').css('display', 'block');
			
			// Enable any game modes.
			if (mode.rotate) {
				$('#game-background').rotate(0);
			}

			// Set an interval for distractions to play while the game is running if it's enabled.
			if (mode.distract && distractions && !distractions.playing) {
				mode.distractId = setInterval(function() {
					if (shouldDistract() ) {
						pickDistraction();
					}
				}, distractionDelay());
			}
			
			// Fill the pattern array and reset our global state.
			generatePattern();
			state.level = state.levelStart;
			state.turn = 0;
			state.replayProgress = 0;
			updateTimeScale(1); // This just resets the time scaling back to normal.

			replayToCurrentLevel();
		}

		function stopGame() {
			// Set the default label to be the loser label.
			var doneLabel = 'Game over,<br />you made it to level: <span class="highlight">' + state.level + '</span>';
		
			// The game is no longer running.
			state.running = false;
			toggleHandlers(false);
			
			// Show the labels again.
			$('#logo').css('visibility', 'visible');
			$('#buttons').css('visibility', 'visible');
			$('#directions').css('visibility', 'visible');
			
			// Update the level label depending on if they won or lost.
			if (state.level >= state.levelMax) {
				doneLabel = 'Well done,<br />you hit the level cap of: <span class="highlight">' + state.level + '</span>';
			}
			$('#level').html(doneLabel);
			
			// Fix the color order because it may have changed from shuffle mode.
			$('#colors').resetColors('li');
			
			// Set the rotation back to normal and cancel it.
			setRotationDegree(0);
			clearTimeout(mode.rotateId);
			
			// Clear the distraction interval.
			clearTimeout(mode.distractId);
			
			// Potentially save the score only if it wasn't a game played from a URL.
			if (!state.playedFromURL) {
				saveScoreToTop5();

				// Set the share game input box only for games you played.
				// Only share games where the player beat at least level 1.
				if (state.level > 1) {
					$('#share').css('visibility', 'visible');
					setShareGame();
				}
			}
			else {
				// The game is over having been played by a URL.
				// Let's clear the URL params and refresh the page.
				reloadToPath();
			}
		}
		
		function showOptions() {
			$('#game-background').css('display', 'none');
			$('#scoreboard').css('display', 'none');
			$('#option-list').css('display', 'block');
		}
		
		function showScoreboard() {
			$('#game-background').css('display', 'none');
			$('#option-list').css('display', 'none');
			$('#scoreboard').css('display', 'block');
		}
		
		/*
		**************************************************************
		Game logic
		**************************************************************
		*/
		
		function color(index) {
			flashColor(index);

			// Correct choice?
			if (state.pattern[state.turn] === index) {
				// We made progress and might be ready to move to the next level.
				state.turn++;
				if (state.level === state.turn) {
					levelUp();
				}
			}
			else {
				// Wrong answer!
				stopGame();
			}
		}
		
		function levelUp() {
			// The game cannot continue if the player has hit the max level.
			if (state.level === state.levelMax) {
				stopGame();
				return;
			}
		
			// We made it to the next level, so our state.turn has to reset and things need to be updated.
			state.level++;
			$('#points').html(state.level);
			state.turn = 0;
			state.replayProgress = 0;
			updateTimeScale();
			
			// Replay to the level at which the player is at.
			setTimeout(function() {
				replayToCurrentLevel();
			}, state.time.turn);
			
			// Randomize the list elements every level up if shuffle mode is enabled.
			if (mode.shuffle) {
				setTimeout(function() {
					$('#colors').randomize('li');
				}, state.time.levelTransition);
			}
		}
		
		function replayToCurrentLevel() {
			// Disable the handlers for the replay duration.
			toggleHandlers(false);

			// Base case to exit out of the recursion.
			// As soon as we get to or past the player's level, we're done.
			if (state.replayProgress >= state.level) {
				toggleHandlers(true);
			}
			else {
				flashColor(state.pattern[state.replayProgress]);

				setTimeout(function() {
					replayToCurrentLevel();
				}, state.time.levelTransition);
				
				state.replayProgress++;
			}
		}

		/*
		**************************************************************
		Scoreboard
		**************************************************************
		*/

		function loadTop5() {
			$('#scoreboard-empty').css('display', 'block');
		
			// We can't show it if the user's browser is not supported by store.js.
			if (!store.enabled) {
				$('#scoreboard-empty').html('Sorry, your web browser does not support this feature.');
				return;
			}
			
			// Get the scores.
			var scores = store.getAll();
			var scoresCount = countScores(scores);
			
			// Time to go, there's nothing to report.
			if (!scoresCount) {
				$('#scoreboard-display').css('display', 'none');
				$('#scoreboard-clear').css('display', 'none');
				$('#scoreboard-empty').html('You have not played any games, there are no scores to display.');
				return;
			}
			
			// Hide the empty message.
			$('#scoreboard-empty').css('display', 'none');
			
			// Show the clear scores link.
			$('#scoreboard-clear').css('display', 'block');
			
			// Populate the scoreboard, it's already in the correct order. First we need to clear the old board though.
			$('#scoreboard-display > tbody').empty();
			for (var key in scores) {
				$('#scoreboard-display > tbody').append('<tr><td>' + scores[key].date + '</td>' + '<td>' + scores[key].level + '</td>' + '<td>' + top5Modes(scores[key].modes) + '</td></tr>');
			}
			$('#scoreboard-display').css('display', 'block');
		}
		
		function saveScoreToTop5() {
			// Exit out early if it's not enabled.
			if (!store.enabled) { return; }

			// Get the scores.
			var scores = store.getAll();
			var scoresCount = countScores(scores);
			var addedToBoard = false;
			
			// If there's no scores then it's easy, just set this score and we're done.
			if (!scoresCount) {
				store.set('entry-0', setEntry());
				loadTop5();
				return;
			}

			// Get an array of sorted scores because we can't sort objects by key in javascript.
			var arrayScores = objectToArray(scores).sort(byLevel);
			
			// Is this score worthy of the scoreboard?
			for (var i = 0; i < scoresCount; i++) {
				// Yeah it is worthy, so we have to adjust the scoreboard.
				// We can add it as long as it's better than an existing score or the board isn't filled up.
				if (state.level > arrayScores[i].level || scoresCount < 5) {
					// Only add it if it hasn't been added yet, because our above condition could happen more than once per loop.
					if (!addedToBoard) {
						arrayScores.splice(i, 0, setEntry());
						addedToBoard = true;
					}
					
					// If we go above 5 in size then we need to pop off the last element.
					if (arrayScores.length > 5) {
						arrayScores.pop();
					}
				}
			}
			
			arrayScores.sort(byLevel);
			
			// If we modified the board then we need to reassemble the board.
			if (addedToBoard) {
				// First we clear the old board and then iterate over our array and add each new score.
				store.clear();
				
				// This time we use <= because we added one to the scoresCount.
				for (var j = 0; j <= scoresCount; j++) {
					// Only set it if it exists.
					if (arrayScores[j]) {
						store.set('entry-' + j, {date: arrayScores[j].date, level: arrayScores[j].level, modes: {shuffle: arrayScores[j].modes.shuffle, rotate: arrayScores[j].modes.rotate, distract: arrayScores[j].modes.distract}});
					}
				}
				
				// Update the scoreboard only if it changed.
				loadTop5();
			}
		}

		// A sort function that sorts by level.
		function byLevel(a, b) {
			var a1 = a.level;
			var b1 = b.level;
			
			if (a1 === b1) return 0;
			
			// Sort it so the highest scores are first.
			return a1 > b1 ? -1 : 1;
		}
		
		// Count the number of scores for the top 5 scoreboard.
		function countScores(obj) {
			var entries = 0;
			
			for (var k in obj) {
				if (obj.hasOwnProperty(k)) {
					entries++;
				}
			}
			
			return entries;
		}

		// Create an html string for each mode icon.
		function top5Modes(obj) {
			var modes = '';
		
			for (var k in obj) {
				if (obj.hasOwnProperty(k)) {
					// Add the mode if it's there and true.
					if (obj[k]) {
						modes += ('<img src="images/icons/' + k + '.png" width="16" height="16" title="' +  k + '" alt="Mode icon" /> ');
					}
				}
			}
			
			return modes;
		}
		
		// Add an item to local storage.
		function setEntry() {
			return {date: generateCleanDate(), level: state.level, modes: {shuffle: mode.shuffle, rotate: mode.rotate, distract: mode.distract}};
		}
		
		// Clear the scores and reload the scoreboard.
		function clearScores() {
			store.clear();
			loadTop5();
		}

		/*
		**************************************************************
		Share game
		**************************************************************
		*/

		function setGameState() {
			// By default it has not been played by the URL.
			state.playedFromURL = false;

			// Setup to require the url params are good.
			var level = urlParam('level');
			var modes = urlParam('modes').split(",");
			var seed = urlParam('seed');

			// Make sure the level is legit and we have exactly 3 modes.
			if (!positiveInt(level) || modes.length !== 3) {
				return;
			}

			// Make sure each mode is true or false strings.
			for (var v in modes) {
				if (modes[v] === 'true' || modes[v] === 'false') {
					// Move onto the next iteration.
					continue;
				}
				else {
					// At least one of them is bad.
					return;
				}
			}

			// Our url params are good, so let's use them.
			if (level >= state.levelMax) {
				state.levelMax = level;
			}

			// Set the level and starting level.
			state.level = level;
			state.levelStart = level;

			// Setup the modes.
			// In javascript any string with > 0 length is true, so we have to do a strict compare to 'true'.
			mode.shuffle = modes[0] === 'true';
			mode.rotate = modes[1] === 'true';
			mode.distract = modes[2] === 'true';

			// Setup the seed.
			state.seed = seed;

			// The game was launched by url.
			// We use this variable to do some extra things at the end of the game as well as skip adding
			// this game to the scoreboard when it finishes.
			state.playedFromURL = true;

			// Start the game automatically.
			startGame();
		}

		// Add the last played game's state to the share input text box.
		function setShareGame () {
			// We want to play back from the level - 1 because that is the level they completed.
			var val = 'http://nickjj.github.com/simon?level=' + (state.level - 1) + '&modes=' + mode.shuffle + ',' + mode.rotate + ',' + mode.distract + '&seed=' + state.seed;

			$('#share-game').val(val);
		}
		
		/*
		**************************************************************
		Utility functions
		**************************************************************
		*/
		
		// Enable or disable being able to click the colors. We want to stop the player from
		// clicking during the replay but then later re-enable it so they can actually play.
		function toggleHandlers(turnOn) {
			for (var i = 0; i < 6; i++) {
				if (turnOn) {
					// Load the click handler from the cache.
					$('#' + i).bind('click', handlers[i]);
				}
				else {
					$('#' + i).unbind('click');
				}
			}
		}
		
		// Speed up the game by 1.5% per level.
		function updateTimeScale(reset) {
			// Error correction if sometime tries to use 0 as the scale.
			if (time.scale <= 0) {
				time.scale = 0.01;
			}
		
			// Calculate the new scaleSpeed but if reset is set then use that value
			// as the final scale speed, we use this to reset time back to normal on game end.
			var scaleAmount = state.level * 0.015;
			var scaleSpeed = (1 - scaleAmount) || reset;
			
			// This is about the point where it gets ridiculous, anything lower than this and it's
			// basically impossible. Not even a Jedi Knight would be able to beat it at this point.
			if (scaleSpeed <= 0.25) {
				scaleSpeed = 0.25;
			}
				
			// Update the values, notice how we never mutate the scale itself so we don't need a copy of it.
			// We use the non-mutated times in our division.
			state.time = {
				turn: (time.turn / time.scale) * scaleSpeed,
				levelTransition: (time.levelTransition / time.scale) * scaleSpeed,
				flashColor: (time.flashColor / time.scale) * scaleSpeed
			};
		}
		
		// Flash a color by adjusting its opacity.
		function flashColor(index) {
			$('#' + index).stop().animate({ opacity: 1 }, state.time.flashColor).animate({ opacity: 0.50 }, state.time.flashColor);
		}

		// Fill the pattern array with random numbers between 0-5.
		function generatePattern() {
			var seed = 0;

			if (state.playedFromURL) {
				// If we're loading it from a URL, use the URL's seed.
				seed = state.seed;
			}
			else {
				// Generate and set a new seed based off the current time.
				seed = new Date().getTime();
				state.seed = seed;
			}

			// Generate a new Mersenne Twister random number generator object.
			// We use this instance of MT to generate this entire pattern.
			// Source: https://gist.github.com/banksean/300494.
			state.mt = new MersenneTwister(seed);

			// Clear and generate a new pattern.
			state.pattern = [];
			
			// Generate numbers up to the max level.
			for (var i = 0; i < state.levelMax; i++) {
				state.pattern.push(generateRandomNumber());
			}
		}

		// Generate a random number between 0 and 5 using Mersenne Twister.
		function generateRandomNumber() {
			return Math.floor(state.mt.random() * 6);
		}
		
		// Rotate the game background to a specific degree.
		function setRotationDegree(degree) {
			// General technique taken from: http://stackoverflow.com/a/3792085.
			$('#game-background').css({WebkitTransform: 'rotate(' + degree + 'deg)'});
			$('#game-background').css({'-moz-transform': 'rotate(' + degree + 'deg)'});
			$('#game-background').css({'-o-transform': 'rotate(' + degree + 'deg)'});
			$('#game-background').css({'-transform': 'rotate(' + degree + 'deg)'});
			$('#game-background').css({'-ms-transform': 'rotate(' + degree + 'deg)'});
		}

		// Convert an object to an array and return the array.
		function objectToArray(obj) {
			var arr = [];
			
			for (var k in obj) {
				if (obj.hasOwnProperty(k)) {
					arr.push(obj[k]);
				}
			}
			
			return arr;
		}
		
		// Generate a nicely formatted date from the time of calling it.
		function generateCleanDate() {
			var ts = new Date();
			
			return digitToWordMonth(ts.getMonth() + 1) + ' '
					+ ts.getDate() + ' '
					+ ts.getFullYear() + ', '
					+ ts.getHours() + ':'
					+ ts.getMinutes() + ':'
					+ ts.getSeconds();
		}
		
		// Convert a digit month to word month.
		function digitToWordMonth(month) {
			switch (month) {
				case 1: {
					return 'Jan';
				}
				case 2: {
					return 'Feb';
				}
				case 3: {
					return 'Mar';
				}
				case 4: {
					return 'Apr';
				}
				case 5: {
					return 'May';
				}
				case 6: {
					return 'Jun';
				}
				case 7: {
					return 'Jul';
				}
				case 8: {
					return 'Aug';
				}
				case 9: {
					return 'Sep';
				}
				case 10: {
					return 'Oct';
				}
				case 11: {
					return 'Nov';
				}
				case 12: {
					return 'Dec';
				}
				default: {
					return '???';
				}	
			}
		}

		// Get a parameter's value from a URL.
		// Source: http://stackoverflow.com/a/1404100.
		function urlParam(name) {
			return decodeURI(
				(RegExp(name + '=' + '(.+?)(&|$)').exec(location.search)||[null])[1]
			);
		}

		// Determine if an input is a positive integer.
		// Source: http://stackoverflow.com/a/10835227.
		function positiveInt(value) {
			return value >>> 0 === parseFloat(value);
		}

		// Reload the browser to a specified path, stripping any url params in the process.
		function reloadToPath() {
			window.location = window.location.pathname;
		}
	})(jQuery);
});