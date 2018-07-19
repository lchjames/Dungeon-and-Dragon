<?php

echo "<displayfield>";
if (include_once 'DBConnect.php') {
    $sql = "SELECT * FROM playerinfo WHERE playername= '$pl'";
    $result = $conn->query($sql);
    if ($result->num_rows > 0) {
        while ($row = $result->fetch_assoc()) {
            echo "<h2>Player list:</h2>";
            echo "探索者姓名:" . $row["playercharacter"] . "<br>玩家姓名:" . $row["playername"] . "<br>年齡:" . $row["age"] . "<br>性別: " . $row["gender"] . "<br>力量:" . $row["strength"] . "    敏捷:" . $row["dexterous"] .
            "    體質:" . $row["constitution"] . "<br>外表:" . $row["appearance"] . "    意志:" . $row["power"] . "    智力:" . $row["intelligence"] . "<br>體型:" . $row["size"] . "    教育:" . $row["education"] .
            "    SAN值:" . $row["sanity"] . "<br>靈感:" . $row["idea"] . "    幸運:" . $row["luck"] . "    知識:" . $row["know"] . "<br>";
        }
    } else {
        echo "No record found";
    }
}
echo "</displayfield>";
$conn->close();
?>