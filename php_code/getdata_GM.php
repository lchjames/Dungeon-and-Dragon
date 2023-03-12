<?php
include 'DBConnect.php';
$sql = "SELECT * FROM playerinfo";
$result = $conn->query($sql);
echo "<displayfield>";
if ($result->num_rows > 0) {
    while ($row = $result->fetch_assoc()) {
        ?>
        <inputfield>
            <form method="post" action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]); ?>" autocomplete="off">
                探索者姓名(PC): <input type="text" name="pc" value="<?php echo $row["playercharacter"] ?>" readonly>
                玩家姓名(PL):   <input type="text" name="pl" value="<?php echo $row["playername"] ?>" readonly>
                年齡:   <input type="text" name="age" value="<?php echo $row["age"] ?>">
                Gender: <input type="text" name="gender" value="<?php echo $row["gender"] ?>">
                <br><b>屬性</b><br>
                力量:   <input type="text" name="STR" value="<?php echo $row["strength"] ?>">
                敏捷:   <input type="text" name="DEX" value="<?php echo $row["dexterous"] ?>">
                體質:   <input type="text" name="CON" value="<?php echo $row["constitution"] ?>">
                外表:   <input type="text" name="APP" value="<?php echo $row["appearance"] ?>"><br>
                意志:   <input type="text" name="POW" value="<?php echo $row["power"] ?>">
                智力:   <input type="text" name="INT" value="<?php echo $row["intelligence"] ?>">
                體型:   <input type="text" name="SIZ" value="<?php echo $row["size"] ?>">
                教育:   <input type="text" name="EDU" value="<?php echo $row["education"] ?>"><br>
                SAN值:  <input type="text" name="SAN" value="<?php echo $row["sanity"] ?>">
                靈感:   <input type="text" name="IDEA" value="<?php echo $row["idea"] ?>">
                幸運:   <input type="text" name="LUCK" value="<?php echo $row["luck"] ?>">
                知識:   <input type="text" name="KNOW" value="<?php echo $row["know"] ?>"><br>
                <input type="submit" name="update" value="Update">  
                <input type="submit" name="delete" value="Delete">
            </form>
        </inputfield>
        <?php
    }
}

echo "</displayfield>";
$conn->close();
?>