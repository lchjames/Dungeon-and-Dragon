<?php
include_once 'topbar.php';
include_once 'getActivity.php';
?>
<html>
	<head>
<meta charset="utf-8">
<title> Puzzle Game</title>
<link rel="stylesheet" href="stylebut.css" />
<link rel="stylesheet" href="styleCard.css" />
	</head>
    <body>
        <h1> Puzzle Game </h1>
		<p align="center"><img src="pic/puzz.png" style="width:90px;height:90px;"></p>
		<p align="center"; style="font-size:20px; color:FF6800; font-family:Comic Sans MS;"> The puzzle game is 
		intended to teach young children how a Python 
		coding language turtle works. it does this by using a variety of different types of puzzles as well as 
		repetition and association based memory exercises. 
		</p>
		<center>
		<div class="card-container">
			<div class="card">
				<div class="face face1">
					<div class="content">
						<p align="center" style="font-family:Comic Sans MS;"><b><u>For Kindergartens and Primary School Students</u></b></p>
						<p align="center" style="font-family:Comic Sans MS;">Category: Technology, Math</p>
						<p align="center" style="font-family:Comic Sans MS;">Rate: 3</p>
						<p align="center" style="font-family:Comic Sans MS;">Difficulty: 3</p>
					</div>
				</div>
				<div class="face face2">
					<h2>Info</h2>
				</div>
			</div>
		</div>
		</center>
		<div class="display-container" align="center">
		  <img class="mySlides" src="pic/puzzle1.jpg" style="width:40%" border="5">
		  <img class="mySlides" src="pic/puzzle2.jpg" style="width:40%" border="5">
		  <img class="mySlides" src="pic/puzzle3.jpg" style="width:40%" border="5">
		  <img class="mySlides" src="pic/puzzle4.jpg" style="width:40%" border="5">
		  <img class="mySlides" src="pic/puzzle5.jpg" style="width:40%" border="5">

		  <button class="left" onclick="plusDivs(-1)">&#10094;</button>
		  <button class="right" onclick="plusDivs(1)">&#10095;</button>
		</div>

		<script>
		var slideIndex = 1;
		showDivs(slideIndex);

		function plusDivs(n) {
		  showDivs(slideIndex += n);
		}

		function showDivs(n) {
		  var i;
		  var x = document.getElementsByClassName("mySlides");
		  if (n > x.length) {slideIndex = 1}
		  if (n < 1) {slideIndex = x.length}
		  for (i = 0; i < x.length; i++) {
			x[i].style.display = "none";  
		  }
		  x[slideIndex-1].style.display = "block";  
		}
		</script>
		</br>
		<p align="center"><img src="pic/puzz1.png" style="width:90px;height:90px;"></p>
		<p style="font-size:17px; color:black; font-family:Comic Sans MS;"> The expected event that can perform this activity is 
		the outdoor group event such as the school trip. The students are given a map and paper description with 
		python turtle graphic codes such as “Forward (60 meters)”. The student are expected to find the location 
		based on these python codes. Furthermore, before performing this activity, the tutor is expected to use paper 
		cards to introduce each simple python code. Overall, this activity provide a memory-based outdoor experience 
		that could help young learners easily remember python codes while they are doing outdoor activities.
		</p>
		<p align="center"><img src="pic/puzz2.png" style="width:90px;height:90px;"></p>
		<p style="font-size:17px; color:black; font-family:Comic Sans MS;"> This game will allow learners to form a group and use the 
		turtle graphic's logics command (such as Forward, Right, Left and Backward) to complete the puzzle which is shown in the 
		big board (See demo video below). Here, we also have made a game to experience this activity.
		</p>
<h2 align="center"; style="color:green; font-family:Comic Sans MS;"> Demo video </h2>	
<div class="iframe-container">
<p align="center">
<iframe width="560" height="315" src="https://www.youtube.com/embed/dbth6_Yq42s" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>
</p>
</br>
<center>
	<div class="wrapper">
	  <a class="cta" href="puzzle.php">
		<span>PLAY GAME</span>
		<span>
		  <svg width="66px" height="43px" viewBox="0 0 66 43" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
			<g id="arrow" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
			  <path class="one" d="M40.1543933,3.89485454 L43.9763149,0.139296592 C44.1708311,-0.0518420739 44.4826329,-0.0518571125 44.6771675,0.139262789 L65.6916134,20.7848311 C66.0855801,21.1718824 66.0911863,21.8050225 65.704135,22.1989893 C65.7000188,22.2031791 65.6958657,22.2073326 65.6916762,22.2114492 L44.677098,42.8607841 C44.4825957,43.0519059 44.1708242,43.0519358 43.9762853,42.8608513 L40.1545186,39.1069479 C39.9575152,38.9134427 39.9546793,38.5968729 40.1481845,38.3998695 C40.1502893,38.3977268 40.1524132,38.395603 40.1545562,38.3934985 L56.9937789,21.8567812 C57.1908028,21.6632968 57.193672,21.3467273 57.0001876,21.1497035 C56.9980647,21.1475418 56.9959223,21.1453995 56.9937605,21.1432767 L40.1545208,4.60825197 C39.9574869,4.41477773 39.9546013,4.09820839 40.1480756,3.90117456 C40.1501626,3.89904911 40.1522686,3.89694235 40.1543933,3.89485454 Z" fill="#FFFFFF"></path>
			  <path class="two" d="M20.1543933,3.89485454 L23.9763149,0.139296592 C24.1708311,-0.0518420739 24.4826329,-0.0518571125 24.6771675,0.139262789 L45.6916134,20.7848311 C46.0855801,21.1718824 46.0911863,21.8050225 45.704135,22.1989893 C45.7000188,22.2031791 45.6958657,22.2073326 45.6916762,22.2114492 L24.677098,42.8607841 C24.4825957,43.0519059 24.1708242,43.0519358 23.9762853,42.8608513 L20.1545186,39.1069479 C19.9575152,38.9134427 19.9546793,38.5968729 20.1481845,38.3998695 C20.1502893,38.3977268 20.1524132,38.395603 20.1545562,38.3934985 L36.9937789,21.8567812 C37.1908028,21.6632968 37.193672,21.3467273 37.0001876,21.1497035 C36.9980647,21.1475418 36.9959223,21.1453995 36.9937605,21.1432767 L20.1545208,4.60825197 C19.9574869,4.41477773 19.9546013,4.09820839 20.1480756,3.90117456 C20.1501626,3.89904911 20.1522686,3.89694235 20.1543933,3.89485454 Z" fill="#FFFFFF"></path>
			  <path class="three" d="M0.154393339,3.89485454 L3.97631488,0.139296592 C4.17083111,-0.0518420739 4.48263286,-0.0518571125 4.67716753,0.139262789 L25.6916134,20.7848311 C26.0855801,21.1718824 26.0911863,21.8050225 25.704135,22.1989893 C25.7000188,22.2031791 25.6958657,22.2073326 25.6916762,22.2114492 L4.67709797,42.8607841 C4.48259567,43.0519059 4.17082418,43.0519358 3.97628526,42.8608513 L0.154518591,39.1069479 C-0.0424848215,38.9134427 -0.0453206733,38.5968729 0.148184538,38.3998695 C0.150289256,38.3977268 0.152413239,38.395603 0.154556228,38.3934985 L16.9937789,21.8567812 C17.1908028,21.6632968 17.193672,21.3467273 17.0001876,21.1497035 C16.9980647,21.1475418 16.9959223,21.1453995 16.9937605,21.1432767 L0.15452076,4.60825197 C-0.0425130651,4.41477773 -0.0453986756,4.09820839 0.148075568,3.90117456 C0.150162624,3.89904911 0.152268631,3.89694235 0.154393339,3.89485454 Z" fill="#FFFFFF"></path>
			</g>
		  </svg>
		</span> 
	  </a>
	</div>
</center>
</br>
</br>
</br>
</body>
</html>