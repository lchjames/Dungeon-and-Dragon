<?php
include 'DBConnect.php';
$pic_name = test_input($_POST["pic_name"]);
$sql = "SELECT image FROM pictures WHERE name = '$pic_name'";
$result = $conn->query($sql);
if ($result->num_rows > 0) {
    $row = $result->fetch_assoc();
    $image_src = "pictures/" . $row['image'];
    ?><img src='<?php echo $image_src; ?>'><?php
} else {
    echo "Image not found";
}
$conn->close();

function test_input($data) {
    $data = trim($data);
    $data = stripslashes($data);
    $data = htmlspecialchars($data);
    return $data;
}
?>
