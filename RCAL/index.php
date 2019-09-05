<meta name="viewport" content="width=device-width, initial-scale=1" />
<html>
    <head>
        <meta charset="UTF-8">
        <link rel="stylesheet" type="text/css" href="styleIndex.css">
        <title>Welcome page</title>
    </head>
    <h1> Coding in the park </h1>
    <script>
        var slideIndex = 1;
        showSlides(slideIndex);

        function plusSlides(n) {
            showSlides(slideIndex += n);
        }

        function currentSlide(n) {
            showSlides(slideIndex = n);
        }

        function showSlides(n) {
            var i;
            var slides = document.getElementsByClassName("mySlides");
            var dots = document.getElementsByClassName("dot");
            if (n > slides.length) {
                slideIndex = 1
            }
            if (n < 1) {
                slideIndex = slides.length
            }
            for (i = 0; i < slides.length; i++) {
                slides[i].style.display = "none";
            }
            for (i = 0; i < dots.length; i++) {
                dots[i].className = dots[i].className.replace(" active", "");
            }
            slides[slideIndex - 1].style.display = "block";
            dots[slideIndex - 1].className += " active";
        }
    </script>
    <body>
	<p align="center"; style="font-size:20px; color:FF6800; font-family:Comic Sans MS;">This project is expressed about teaching young children to learn basic programming knowledge.</p>
	<p align="center"; style="font-size:20px; color:FF6800; font-family:Comic Sans MS;">Our goal is to design a portal which contains a list of activities.</p>
    <p align="center"; style="font-size:20px; color:FF6800; font-family:Comic Sans MS;">These activities are to convey different aspects 
            of S.T.E.M’s technology aspect to students through the means of outdoor activities.</p>
    <p align="center"; style="font-size:20px; color:FF6800; font-family:Comic Sans MS;">This is to give an alternate learning experience that gives a different perspective by using physical activities as an 
            instrument and example of the teaching concepts.</p> 
		<!-- Slideshow container 
        <div class="slideshow-container">

            <!-- Full-width images 
            <div class="mySlides fade">
                <img src="pic/pic1.jpg" style="width:100%">
            </div>
            <div class="mySlides fade">
                <img src="pic/pic2.jpg" style="width:100%">
            </div>
            <div class="mySlides fade">
                <img src="pic/pic3.jpg" style="width:100%">
            </div>

            <!-- Next and previous buttons 
            <a class="prev" onclick="plusSlides(-1)">&#10094;</a>
            <a class="next" onclick="plusSlides(1)">&#10095;</a>
        </div>
        <br>
        <div style="text-align:center">
            <span class="dot" onclick="currentSlide(1)"></span> 
            <span class="dot" onclick="currentSlide(2)"></span> 
            <span class="dot" onclick="currentSlide(3)"></span> 
        </div>
        <br>-->
    <center>
        <button class="button" onclick="location.href = 'activity.php'"><span>Welcome </span></button>
    </center>
</body>
<script>
    showSlides(slideIndex);
</script>
</html>
