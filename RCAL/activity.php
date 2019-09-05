<?php
include_once 'topbar.php';
include_once 'getActivity.php';
?>
<html>
<head>
	<meta charset="utf-8">
	<title>Activities List</title>
	<link rel="stylesheet" href="style3.css">
</head>
    <body>
        <h1> Activities List</h1>
		<center>
		<div class="container">
			<div class="box">
				<div class="imgBox">
				<a href="puzzleactivity.php">
					<img src="pic/puzz.jpg" alt="puzzle activity">
				</a>
				</div>
				<div class="details">
					<div class="content">
						<a href="puzzleactivity.php" style="text-decoration:none" title="Go to Puzzle Game page">
						<h2> Puzzle Game </h2>
						</a>
					</div>
				</div>
			</div>
			
			<div class="box">
				<div class="imgBox">
				<a href="fishactivity.php">
					<img src="pic/pic2.jpg" alt="fishing activity">
				</a>
				</div>
				<div class="details">
					<div class="content">
						<a href="fishactivity.php" style="text-decoration:none" title="Go to Fishing Game page">
						<h2> Fishing Game </h2>
						</a>
					</div>
				</div>
			</div>
			
			<div class="box">
				<div class="imgBox">
				<a href="cityactivity.php">
					<img src="pic/city.jpg" alt="city hunt activity">
				</a>
				</div>
				<div class="details">
					<div class="content">
						<a href="cityactivity.php" style="text-decoration:none" title="Go to City Hunt page">
						<h2> City Hunt </h2>
						</a>
					</div>
				</div>
			</div>
			
			<div class="box">
				<div class="imgBox">
				<a href="picactivity.php">
					<img src="pic/pict.png" alt="pictures observation activity">
				</a>
				</div>
				<div class="details">
					<div class="content">
						<a href="picactivity.php" style="text-decoration:none" title="Go to Pictures Games page">
						<h2>Pictures Game</h2>
						</a>
					</div>
				</div>
			</div>
			
			<div class="box">
				<div class="imgBox">
				<a href="ifthenact.php">
					<img src="pic/ifthen.png" alt="ifthen activity">
				</a>
				</div>
				<div class="details">
					<div class="content">
						<a href="ifthenact.php" style="text-decoration:none" title="Go to If...Then... Game page">
						<h2>If...then... Game</h2>
						</a>
					</div>
				</div>
			</div>
			
			<div class="box">
				<div class="imgBox">
				<a href="mazeact.php">
					<img src="pic/logicmz.jpg" alt="logic maze activity">
				</a>
				</div>
				<div class="details">
					<div class="content">
						<a href="mazeact.php" style="text-decoration:none" title="Go to The Logic Maze page">
						<h2> Logic Maze </h2>
						</a>
					</div>
				</div>
			</div>
		</br>
		</br>
		</br>
		</br>
		</br>
		</br>
		<h1> Table View </h1>
        <table>
            <tr>
                <th>Activity Name</th>
                <th>Category</th>
                <th>Activity Type</th>
                <th>Rate</th>
                <th>Difficulty</th>
                <th>Discription</th>
            </tr>
            <?php
            while ($row = mysqli_fetch_array($result)) {
                ?>
                <tr>
                    <td><?php echo $row ['activity_name']; ?></td>
                    <td><?php echo $row ['category']; ?></td>
                    <td><?php echo $row ['activity_type']; ?></td>
                    <td><?php echo $row ['rating']; ?></td>
                    <td><?php echo $row ['difficulty']; ?></td>
                    <td><textarea rows="4" readonly style="resize: none; width: 100%; color: black; background-color: transparent;"><?php echo $row ['description']; ?></textarea></td>    
                </tr>
                <?php
            }
            ?>
        </table>
		</center>
    </body>
</html>